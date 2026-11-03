import { describe,expect,it } from 'vitest';
import { DEFAULT_TRAINING,trainingConditions,validateTrainingSettings } from '../../src/app/hypothetical-training';
import { applyTrainingConditions } from '../../src/app/training-conditions';
import { simulateTrainingEvaluation } from '../../src/app/training-simulation';
import { evaluateCollection } from '../../src/app/evaluate-collection';
import { exportConversion,prepareExport } from '../../src/app/export-conversion';
import { createTrainingSettings,TRAINING_STORAGE_KEY } from '../../src/storage/training-settings';
import { trainingEvaluationFixture } from '../helpers/training-evaluation';
import { fictionalProfile } from '../helpers/conversion';
import { maximumTrainingFixture } from '../helpers/maximum-training';

const keep={trainingStage:null,awakeningStage:null,liveSkillLevel:null,gekisouSkillLevel:null,snapRank:null} as const;
describe('shared UI conditions and bond-aware evaluation',()=>{
  it.each([null,1,2,3,4,5] as const)('roundtrips all five settings for target %s',target=>{
    const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
    const settings={trainingStage:target,awakeningStage:target,liveSkillLevel:target,gekisouSkillLevel:target,snapRank:target};
    createTrainingSettings(storage).update(settings);
    expect(createTrainingSettings(storage).current()).toEqual(settings);
    const {m,c}=trainingEvaluationFixture();const projected=applyTrainingConditions(m,c,trainingConditions(settings));
    const stage=target===null||target===1?1:2;
    expect(projected.members[0]).toMatchObject({trainingStage:stage,awakeningStage:stage,liveSkillLevel:stage,gekisouSkillLevel:stage,level:stage});
    expect(projected.snaps.map(s=>[s.rank,s.level])).toEqual([[stage,stage===1?2:3],[stage,stage===1?2:3]]);
  });
  it('reads old settings without writing and migrates only on explicit edits',()=>{
    const old={trainingStage:3,awakeningStage:null,liveSkillLevel:2,gekisouSkillLevel:4};let raw=JSON.stringify(old),writes=0;
    const storage={getItem:(k:string)=>k===TRAINING_STORAGE_KEY?raw:null,setItem:(_k:string,v:string)=>{raw=v;writes++;}};
    const store=createTrainingSettings(storage);
    expect(store.current()).toEqual({...old,snapRank:null});expect(writes).toBe(0);
    store.update({...store.current(),snapRank:1});expect(writes).toBe(1);
    expect(createTrainingSettings(storage).current().snapRank).toBe(1);
    for(const bad of [{...keep,snapRank:6},{...keep,trainingStage:'max'},{...keep,snapRank:undefined},{trainingStage:null}])expect(()=>validateTrainingSettings(bad)).toThrow();
  });
  it('caps Lv even with unchanged stages, never lowers targets, and leaves inputs detached',()=>{
    const {m,c}=trainingEvaluationFixture();c.members[0]!.trainingStage=2;c.snaps[0]!.rank=2;
    const saved=JSON.stringify([m,c]);
    const result=simulateTrainingEvaluation(m,c,keep);
    expect(result.target.members[0]!.level).toBe(2);expect(result.target.snaps.map(s=>s.level)).toEqual([3,2]);
    const low=simulateTrainingEvaluation(m,result.target,{trainingStage:1,awakeningStage:1,liveSkillLevel:1,gekisouSkillLevel:1,snapRank:1});
    expect(low.target).toEqual(result.target);expect(JSON.stringify([m,c])).toBe(saved);
    result.target.members[0]!.level=1;expect(c.members[0]!.level).toBe(1);
  });
  it('uses converged ranks for character rating, global total and bonus; current stays ordinary',()=>{
    const {m,c}=trainingEvaluationFixture();const saved=JSON.stringify([m,c]);
    const result=simulateTrainingEvaluation(m,c,DEFAULT_TRAINING);
    expect(result.before.colors).toEqual(evaluateCollection(m,c));expect(result.before.rating).toBe(645);
    expect(result.after.ranks.map(r=>r.effectiveRank)).toEqual([4,4,4,4,4]);expect(result.after.totalRank).toBe(20);
    expect(result.after.bonus).toMatchObject({bonus:17,source:'rules'});
    // P/T/V 126/273/444, h=.06, C=5*(4-1)+17=32: 165+321+502=988; floor(988*1.32)=1304.
    expect(result.after.rating).toBe(1304);
    expect(result.after.colors[0]!.slots[0]!.input).toMatchObject({characterRank:4,totalRankBonus:17});
    expect(result.bondTheory(8101)).toMatchObject({status:'ready',iterations:expect.any(Number)});
    expect(result.materials.totals).toEqual([{resourceId:'member-exp',quantity:43},{resourceId:'paper',quantity:20},{resourceId:'snap-exp',quantity:126}]);
    expect(JSON.stringify([m,c])).toBe(saved);
  });
  it('ignores rank/bond overrides for theory, preserves explicit bonus including zero, and refreshes each scenario',()=>{
    const {m,c}=trainingEvaluationFixture();c.characterRanks={8201:1};c.characterProgress={8201:{bondRankTotal:999}};c.totalRankBonus=0;
    const saved=JSON.stringify(c),a=simulateTrainingEvaluation(m,c,DEFAULT_TRAINING);
    expect(a.after.ranks[0]!.effectiveRank).toBe(4);expect(a.after.bonus).toMatchObject({source:'manual',bonus:0});
    // C=15 => 148+304+485=937; floor(937*1.32)=1236.
    expect(a.after.rating).toBe(1236);expect(a.current.characterRanks).toEqual(c.characterRanks);
    m.rankDefinition!.achievements.find(a=>a.kind==='bondRankTotal')!.thresholds=[9999];
    const b=simulateTrainingEvaluation(m,c,keep);
    expect(b.after.ranks.map(r=>r.effectiveRank)).toEqual([1,1,1,1,1]);expect(b.after.totalRank).toBe(5);
    expect(JSON.stringify(c)).toBe(saved);
  });
  it('holds theory ratings when unavailable even if manual rank and bonus resolve current ratings',()=>{
    const {m,c}=trainingEvaluationFixture();delete m.rankDefinition;c.characterRanks={8201:3};c.totalRankBonus=0;
    const a=simulateTrainingEvaluation(m,c,DEFAULT_TRAINING);
    expect(a.before.rating).not.toBeNull();expect(a.after.rating).toBeNull();expect(a.after.totalRank).toBeNull();
    expect(a.after.colors[0]!.slots[0]!.reasons.join(' ')).toContain('絆理論値は保留');
  });
  it('refreshes theory when conditions or owned cards change',()=>{
    const {m,c}=maximumTrainingFixture();
    m.rankDefinition!.achievements.find(a=>a.kind==='bondRankTotal')!.thresholds=[1];
    const trained=simulateTrainingEvaluation(m,c,DEFAULT_TRAINING);
    const unchanged=simulateTrainingEvaluation(m,c,keep);
    const unowned=simulateTrainingEvaluation(m,{...c,members:[]},DEFAULT_TRAINING);
    expect(trained.after.ranks.map(r=>r.effectiveRank)).toEqual([4,2]);
    expect(unchanged.after.ranks.map(r=>r.effectiveRank)).toEqual([2,2]);
    expect(unowned.after.ranks.map(r=>r.effectiveRank)).toEqual([2,2]);
    expect(unowned.after.rating).toBeNull();
  });
  it('uses every band theory for the global bonus, including bands with no owned Member',()=>{
    const {m,c}=trainingEvaluationFixture();m.bands.push({id:8102,name:'架空の別紙バンド'});
    m.characters.push(...[8211,8212,8213,8214,8215].map(id=>({id,bandId:8102,name:`架空の別紙奏者${id}`})));
    m.rankDefinition!.totalRankBonuses=[{rank:0,bonus:0},{rank:30,bonus:17}];
    const result=simulateTrainingEvaluation(m,c,DEFAULT_TRAINING);
    expect(result.after.totalRank).toBe(40);expect(result.after.bonus.bonus).toBe(17);expect(result.after.rating).toBe(1304);
  });
  it('exports ordinary projected ranks and Snap with the existing profile, excluding theory',async()=>{
    const {m,c}=trainingEvaluationFixture();const profile=await fictionalProfile(m),saved=JSON.stringify([m,c,profile]);
    const off=prepareExport(m,c,{applyTraining:false,training:DEFAULT_TRAINING});
    const on=prepareExport(m,c,{applyTraining:true,training:{...DEFAULT_TRAINING,snapRank:2}});
    expect(off.data.members).toEqual(c.members);expect(off.data.snaps).toEqual(c.snaps);expect(off.totalRank).toBe(5);
    expect(on.data.ranks.map(r=>r.value)).toEqual([4,1,1,1,1]);expect(on.totalRank).toBe(8);
    expect(on.data.snaps.map(s=>[s.rank,s.level])).toEqual([[2,3],[2,3]]);
    const json=JSON.parse((await exportConversion(m,c,profile,{applyTraining:true,training:DEFAULT_TRAINING})).text);
    expect(json.total).toBe(8);expect(json.ranks).toEqual({8201:4,8202:1,8203:1,8204:1,8205:1});
    c.characterRanks={8201:2};expect(prepareExport(m,c,{applyTraining:true,training:DEFAULT_TRAINING}).data.ranks[0]!.value).toBe(2);
    c.characterRanks={};expect(JSON.stringify([m,c,profile])).toBe(saved);
  });
  it('costs only the requested state difference',()=>{
    const {m,c}=trainingEvaluationFixture();const a=simulateTrainingEvaluation(m,c,keep);
    expect(a.materials.totals).toEqual([{resourceId:'snap-exp',quantity:126}]);
    const b=simulateTrainingEvaluation(m,c,{...keep,trainingStage:2});
    expect(b.materials.totals).toEqual([{resourceId:'member-exp',quantity:43},{resourceId:'paper',quantity:7},{resourceId:'snap-exp',quantity:126}]);
  });
});
