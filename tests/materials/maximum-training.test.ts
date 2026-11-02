import {describe,it,expect} from 'vitest';
import {maximumTrainingFixture} from '../helpers/maximum-training';
import {materialFixture} from '../helpers/materials';
import {maximumTrainingTarget,simulateMaximumTraining,maximumTrainingBondTheory} from '../../src/app/maximum-training';
import {calculateMaterialRequirementsToTarget} from '../../src/domain/materials/calculate';
import {validateCatalog} from '../../src/data/catalog/validate';
import {validateCollection} from '../../src/storage/collection';
import {evaluateCollection} from '../../src/app/evaluate-collection';
import {potentialCollection} from '../../src/app/potential-collection';

describe('maximum training without additional copies',()=>{
  it('shares a legal target across costs, rank, bonus and whole-band reevaluation, without mutation',()=>{
    const {m,c}=maximumTrainingFixture();validateCatalog(m);
    const before=JSON.stringify([m,c]);const r=simulateMaximumTraining(m,c);
    expect(r.target.members).toEqual([{cardId:8301,level:2,trainingStage:2,awakeningStage:1,liveSkillLevel:2,gekisouSkillLevel:2}]);
    expect(r.target.snaps).toEqual([{supportCardId:8501,level:2,rank:1},{supportCardId:8504,level:2,rank:1}]);
    expect(validateCollection(r.target,m)).toEqual(r.target);
    // Training 7 + Live 13; awakening 11 and 2 Snap copies are outside this scenario.
    // Member EXP 60-17=43; each Snap EXP 80-17=63, counted once even with 2 characters.
    expect(r.materials.totals).toEqual([{resourceId:'member-exp',quantity:43},{resourceId:'paper',quantity:20},{resourceId:'snap-exp',quantity:126}]);
    expect(r.materials).toEqual(calculateMaterialRequirementsToTarget(m,c,r.target));
    expect(r.materials.cards[0]!.axes.map(a=>[a.axis,a.target])).toEqual([['trainingStage',2],['awakeningStage',1],['liveSkillLevel',2],['gekisouSkillLevel',2],['level',2]]);
    expect(r.before.ranks.map(r=>r.effectiveRank)).toEqual([1,1]);
    expect(r.after.ranks.map(r=>r.effectiveRank)).toEqual([4,1]);
    expect(r.before.totalRank).toBe(2);expect(r.after.totalRank).toBe(5);
    expect(r.before.bonus).toMatchObject({bonus:0,source:'rules'});expect(r.after.bonus).toMatchObject({bonus:10,source:'rules'});
    expect(r.before.colors[0]!.slots[0]!.selection.snap).toMatchObject({status:'selected',candidate:{id:8501}});
    expect(r.after.colors[0]!.slots[0]!.selection.snap).toMatchObject({status:'selected',candidate:{id:8504}});
    // P/T/V current 65/171/321, h=.04, rank1, bonus0 -> B=67+177+333=577.
    // K=1+(160+327+493)/10000+.02=1.118; floor(577*K)=645.
    // Target 126/273/444, h=.06, rank4, bonus10 -> B=158+314+495=967.
    // Selected Snap 1000/1000/1000, U1 -> K=1.32; floor(967*K)=1276.
    expect(r.before.rating).toBe(645);expect(r.after.rating).toBe(1276);
    expect(r.bands[0]!.characters[0]!.rankDelta).toBe(3);
    expect(r.bands[0]!.materials.totals).toEqual([{resourceId:'member-exp',quantity:43},{resourceId:'paper',quantity:20}]);
    expect(r.snapMaterials.totals).toEqual([{resourceId:'snap-exp',quantity:126}]);
    expect(r.bands[0]!.characters[1]!.materials.totals).toEqual([]);
    expect(JSON.stringify([m,c])).toBe(before);
    r.target.characterProgress![8201]!.bondRankTotal=99;
    r.target.bandItems[8601]=1;
    expect(JSON.stringify([m,c])).toBe(before);
  });
  it('uses actual group caps and arbitrary skill maxima; reaches Lv cap even if training already maxed',()=>{
    const {m,c}=maximumTrainingFixture();
    m.members[0]!.liveSkillLevels=[1,2,9];
    m.materialDefinition!.schedules.find(s=>s.id==='live')!.stages.push({stage:9,amounts:[]});
    m.memberLevels.push({...m.memberLevels[1]!,level:8});
    m.materialDefinition!.schedules.find(s=>s.id==='member-lv')!.stages.push({stage:8,amounts:[{resourceId:'member-exp',quantity:100}]} );
    c.members[0]!.trainingStage=2;
    c.snaps[0]!.rank=2;
    validateCatalog(m);
    const t=maximumTrainingTarget(m,c);
    expect(t.members[0]).toMatchObject({level:2,trainingStage:2,awakeningStage:1,liveSkillLevel:9});
    expect(t.snaps[0]).toMatchObject({rank:2,level:3});expect(t.snaps[1]).toMatchObject({rank:1,level:2});
  });
  it('counts a shared Snap once even when it contributes to multiple bands; groups Member currency costs',()=>{
    const {m,c}=maximumTrainingFixture();
    m.bands.push({id:8102,name:'架空の紙吹奏団'});
    m.characters.push({id:8203,bandId:8102,name:'架空の紙太鼓奏者'});
    m.members.push({...m.members[0]!,id:8302,characterId:8203});
    c.members.push({...c.members[0]!,cardId:8302});
    m.bandItems.push({id:8602,bandId:8102,name:'架空の紙机'});
    m.bandItemLevels.push({itemId:8602,level:1});
    m.bandItemEffects.push({itemId:8602,level:1,effectType:1000,valueBp:0,targetIds:[8702]});
    m.skillTargets.push({id:8702,targetType:3,bandId:8102,characterId:0,cardType:0,tagId:0});
    c.bandItems[8602]=null;
    m.snaps.forEach(s=>{s.characterIds=[...s.characterIds,8203];});
    m.materialDefinition!.resources.push({id:'currency',name:'架空コイン',unit:'item'});
    m.materialDefinition!.schedules.find(s=>s.id==='train')!.stages[1]!.amounts.push({resourceId:'currency',quantity:23});
    m.materialDefinition!.bindings.push(...m.materialDefinition!.bindings.filter(b=>b.kind==='member').map(b=>({...b,cardId:8302})));
    validateCatalog(m);
    const r=simulateMaximumTraining(m,c);
    expect(r.materials.totals).toEqual([{resourceId:'currency',quantity:46},{resourceId:'member-exp',quantity:86},{resourceId:'paper',quantity:40},{resourceId:'snap-exp',quantity:126}]);
    expect(r.bands.map(b=>b.materials.totals)).toEqual(Array.from({length:2},()=>[{resourceId:'currency',quantity:23},{resourceId:'member-exp',quantity:43},{resourceId:'paper',quantity:20}]));
    expect(r.after.bands.map(b=>b.colors[0]!.slots[0]!.selection.snap)).toEqual(Array.from({length:2},()=>expect.objectContaining({status:'selected',candidate:expect.objectContaining({id:8504})})));
  });
  it('preserves manual ranks, bonus0, progress and items; shows auto estimates separately',()=>{
    const {m,c}=maximumTrainingFixture();c.characterRanks={8201:3};c.totalRankBonus=0;c.tgwRank=17;
    const r=simulateMaximumTraining(m,c),character=r.bands[0]!.characters[0]!;
    expect(character.before).toMatchObject({effectiveRank:3,estimatedRank:1,overrideRank:3});
    expect(character.after).toMatchObject({effectiveRank:3,estimatedRank:4,overrideRank:3});
    expect(character.rankDelta).toBeNull();
    expect(r.before.bonus).toMatchObject({source:'manual',bonus:0});expect(r.after.bonus).toEqual(r.before.bonus);
    expect(r.target.characterRanks).toEqual(c.characterRanks);expect(r.target.characterProgress).toEqual(c.characterProgress);
    expect(r.target.bandItems).toEqual(c.bandItems);expect(r.target.tgwRank).toBe(17);
    // Normal hypothetical training continues to use current ranks, bonus and Snap state.
    expect(evaluateCollection(m,potentialCollection(m,c),c)[0]!.slots[0]!.input?.characterRank).toBe(3);
  });
  it('reuses the bond fixed point and distinguishes theoretical character ranks from pair caps and actual data',()=>{
    const {m,c}=maximumTrainingFixture();c.characterRanks={8201:1,8202:4};c.characterProgress![8202]!.bondRankTotal=99;
    const saved=JSON.stringify(c),target=maximumTrainingTarget(m,c);
    const theory=maximumTrainingBondTheory(m,target,8101);
    // At start ranks4/1 give pair1. Only 1 bond point cannot reach threshold2.
    // A hypothetical pair2/rank2 is self-consistent but unreachable; keep pair1.
    expect(theory).toMatchObject({status:'ready',characters:[{id:8201,finalRank:4},{id:8202,finalRank:1}],pairs:[{characterA:8201,characterB:8202,rank:1}]});
    expect(JSON.stringify(c)).toBe(saved);expect(target.characterRanks).toEqual(c.characterRanks);
    m.rankDefinition!.achievements.find(a=>a.kind==='bondRankTotal')!.thresholds=[1];
    expect(maximumTrainingBondTheory(m,target,8101)).toMatchObject({status:'ready',characters:[{finalRank:4},{finalRank:2}],pairs:[{rank:2}]});
    delete m.rankDefinition;
    expect(maximumTrainingBondTheory(m,target,8101).status).toBe('pending');
  });
  it('keeps costs partial, missing ranks and rating pending instead of reporting a zero difference',()=>{
    const {m,c}=maximumTrainingFixture();delete m.rankDefinition;delete m.materialDefinition;
    const r=simulateMaximumTraining(m,c);
    expect(r.materials.incomplete).toBe(true);expect(r.materials.totals).toEqual([]);
    expect(r.materials.cards[0]!.axes.filter(a=>a.status==='complete').map(a=>a.axis)).toEqual(['awakeningStage']);
    expect(r.before.rating).toBeNull();expect(r.after.rating).toBeNull();expect(r.bands[0]!.characters[0]!.rankDelta).toBeNull();
    const partial=maximumTrainingFixture();partial.m.materialDefinition!.bindings=partial.m.materialDefinition!.bindings.filter(b=>b.axis!=='trainingStage');
    const p=simulateMaximumTraining(partial.m,partial.c);
    expect(p.materials.incomplete).toBe(true);expect(p.materials.totals.find(a=>a.resourceId==='paper')!.quantity).toBe(13);
    expect(p.after.rating).toBe(1276);
  });
  it('retains out-of-catalog manual ranks as unknown; missing bonus tables or items remain pending',()=>{
    const {m,c}=maximumTrainingFixture();c.characterRanks={8201:99};
    const manual=simulateMaximumTraining(m,c);
    expect(manual.after.ranks[0]).toMatchObject({overrideRank:99,estimatedRank:4,effectiveRank:null});expect(manual.after.rating).toBeNull();
    c.characterRanks={};delete m.rankDefinition!.totalRankBonuses;
    expect(simulateMaximumTraining(m,c).after.rating).toBeNull();
    c.totalRankBonus=0;c.bandItems={};
    expect(simulateMaximumTraining(m,c).after.colors[0]!.slots[0]!.reasons).toContain('対象バンドのアイテムに未設定があります');
  });
  it('does not invent stage dependencies; already completed training has no additional costs',()=>{
    const {m,c}=materialFixture();
    const target=maximumTrainingTarget(m,c),r=calculateMaterialRequirementsToTarget(m,target,target);
    expect(r.totals).toEqual([]);expect(r.incomplete).toBe(false);
    expect(target.members[0]!.awakeningStage).toBe(1);expect(target.snaps[0]!.rank).toBe(1);
    expect(()=>calculateMaterialRequirementsToTarget(m,c,{...target,snaps:[]})).toThrow(/一致/);
    const lower=structuredClone(target);lower.members[0]!.liveSkillLevel=1;
    expect(()=>calculateMaterialRequirementsToTarget(m,target,lower)).toThrow(/以上/);
  });
});
