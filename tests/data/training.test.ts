import { describe, it, expect } from 'vitest';
import { applyHypotheticalTraining, DEFAULT_TRAINING, validateTrainingSettings } from '../../src/app/hypothetical-training';
import { potentialCollection } from '../../src/app/potential-collection';
import { prepareExport } from '../../src/app/export-conversion';
import { evaluateCollection } from '../../src/app/evaluate-collection';
import { createTrainingSettings, TRAINING_STORAGE_KEY } from '../../src/storage/training-settings';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';
const unchanged={trainingStage:null,awakeningStage:null,liveSkillLevel:null,gekisouSkillLevel:null} as const;
describe('shared hypothetical training',()=>{
  it.each(['trainingStage','awakeningStage','liveSkillLevel','gekisouSkillLevel'] as const)('raises only %s, with member Lv coupled only to training',key=>{
    const m=syntheticCatalog(), c=syntheticCollection(m), before=JSON.stringify([m,c]);
    const p=applyHypotheticalTraining(m,c,{...unchanged,[key]:5});
    expect(p.members[0]).toEqual({...c.members[0],[key]:2,...(key==='trainingStage'?{level:2}:{})});
    expect(JSON.stringify([m,c])).toBe(before);
    const current=evaluateCollection(m,c,c)[0]!.rating!;
    expect(evaluateCollection(m,p,c)[0]!.rating!).toBeGreaterThan(current);
  });
  it('keeps all values without targets and never lowers values above a target or in a gap',()=>{
    const m=syntheticCatalog(),c=syntheticCollection(m);
    expect(applyHypotheticalTraining(m,c,unchanged)).toEqual(c);
    m.members[0]!.liveSkillLevels=[1,3,5];c.members[0]!.liveSkillLevel=5;
    expect(applyHypotheticalTraining(m,c,{...unchanged,liveSkillLevel:2}).members[0]!.liveSkillLevel).toBe(5);
    c.members[0]!.liveSkillLevel=1;
    expect(applyHypotheticalTraining(m,c,{...unchanged,liveSkillLevel:4}).members[0]!.liveSkillLevel).toBe(3);
    expect(applyHypotheticalTraining(m,c,{...unchanged,liveSkillLevel:2}).members[0]!.liveSkillLevel).toBe(1);
  });
  it('keeps an arbitrary current member Lv if training stays at its current stage',()=>{
    const m=syntheticCatalog(),c=syntheticCollection(m);c.members[0]!.trainingStage=2;
    expect(applyHypotheticalTraining(m,c,DEFAULT_TRAINING).members[0]!.level).toBe(1);
  });
  it('uses identical members in rating and export, while OFF preserves real ownership',()=>{
    const m=syntheticCatalog(),c=syntheticCollection(m),settings={...DEFAULT_TRAINING,awakeningStage:2 as const};
    const p=potentialCollection(m,c,settings);
    const options={complete:true,applyTraining:true,training:settings};
    expect(prepareExport(m,c,options).data.members).toEqual(p.members);
    expect(prepareExport(m,c,{...options,applyTraining:false}).data.members).toEqual(c.members);
  });
  it('persists independently, notifies both subscribers, restores, and protects corrupt settings',()=>{
    const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
    const a=createTrainingSettings(storage);let rating=0,exp=0;a.subscribe(()=>rating++);a.subscribe(()=>exp++);
    a.update({...unchanged,awakeningStage:3});expect([rating,exp]).toEqual([1,1]);
    expect(createTrainingSettings(storage).current()).toEqual({...unchanged,awakeningStage:3});expect([...data.keys()]).toEqual([TRAINING_STORAGE_KEY]);
    data.set(TRAINING_STORAGE_KEY,'broken');const b=createTrainingSettings(storage);expect(b.current()).toEqual(DEFAULT_TRAINING);
    b.update(unchanged);expect(data.get(TRAINING_STORAGE_KEY)).toBe('broken');b.update(unchanged,true);expect(b.damaged()).toBe(false);
  });
  it('rejects malformed settings and reports failed persistence without losing session settings',()=>{
    for(const bad of [null,[],{}, {...DEFAULT_TRAINING,liveSkillLevel:1},{...DEFAULT_TRAINING,extra:2}]) expect(()=>validateTrainingSettings(bad)).toThrow();
    const s=createTrainingSettings({getItem:()=>null,setItem:()=>{throw Error('quota');}});s.update(unchanged);expect(s.current()).toEqual(unchanged);expect(s.message()).toContain('未保存');
  });
});

it('keeps real character rank, total bonus, Snap and items even when all growth targets rise',async()=>{
  const {fictionalRules}=await import('../helpers/rank-rules');
  const {bindRankRules}=await import('../../src/domain/character-rank/rules');
  const m=syntheticCatalog(),c=syntheticCollection(m);delete c.characterRanks['8201'];delete c.totalRankBonus;
  const definition=await fictionalRules(m);definition.totalRankBonuses=[{rank:0,bonus:13},{rank:5,bonus:29}];
  const rules=await bindRankRules(definition,m);
  const settings={...DEFAULT_TRAINING,awakeningStage:5 as const};
  const p=potentialCollection(m,c,settings),real=evaluateCollection(m,c,c,rules)[0]!.slots[0]!.input!;
  const virtual=evaluateCollection(m,p,c,rules)[0]!.slots[0]!.input!;
  expect(virtual).toMatchObject({characterRank:real.characterRank,totalRankBonus:real.totalRankBonus,snapPercentBp:real.snapPercentBp,snapLimitBreak:real.snapLimitBreak,bandItemTenthPercent:real.bandItemTenthPercent});
  expect(prepareExport(m,c,{applyTraining:true,training:settings,complete:true},rules).ranks).toEqual(prepareExport(m,c,{applyTraining:false,training:settings,complete:true},rules).ranks);
});
