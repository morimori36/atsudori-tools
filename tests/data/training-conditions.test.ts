import {describe,it,expect} from 'vitest';
import {applyTrainingConditions,KEEP_TRAINING,MAXIMUM_TRAINING,validateTrainingConditions} from '../../src/app/training-conditions';
import type {TrainingConditions} from '../../src/app/training-conditions';
import {simulateTraining} from '../../src/app/training-simulation';
import {maximumTrainingTarget,simulateMaximumTraining} from '../../src/app/maximum-training';
import {legacyTrainingConditions,applyHypotheticalTraining,DEFAULT_TRAINING} from '../../src/app/hypothetical-training';
import {prepareExport} from '../../src/app/export-conversion';
import {maximumTrainingFixture} from '../helpers/maximum-training';
import {validateCatalog} from '../../src/data/catalog/validate';
import {validateCollection} from '../../src/storage/collection';

const conditions=(member:Partial<TrainingConditions['member']>={},snap:Partial<TrainingConditions['snap']>={}):TrainingConditions=>({
  member:{...KEEP_TRAINING.member,...member},snap:{...KEEP_TRAINING.snap,...snap},
});
describe('common training projection',()=>{
  it('keeps all axes, ownership and manual data in a detached legal collection, deterministically',()=>{
    const {m,c}=maximumTrainingFixture();c.tgwRank=17;c.totalRankBonus=0;c.characterRanks={8201:3};
    c.members[0]!.displayedStatsOverride={performance:1,technic:2,visual:3};
    const saved=JSON.stringify([m,c]);const t=applyTrainingConditions(m,c,KEEP_TRAINING);
    expect(t).toEqual(c);expect(t).toEqual(applyTrainingConditions(m,c,KEEP_TRAINING));
    t.characterProgress![8201]!.bondRankTotal=99;t.bandItems[8601]=1;t.characterRanks[8201]=4;
    t.members[0]!.displayedStatsOverride={performance:99,technic:2,visual:3};t.snaps[0]!.level=2;
    expect(JSON.stringify([m,c])).toBe(saved);
  });
  it.each([
    ['trainingStage',{trainingStage:2},{trainingStage:2}],
    ['awakeningStage',{awakeningStage:2},{awakeningStage:2}],
    ['liveSkillLevel',{liveSkillLevel:2},{liveSkillLevel:2}],
    ['gekisouSkillLevel',{gekisouSkillLevel:2},{gekisouSkillLevel:2}],
  ] as const)('raises only Member %s and leaves Lv fixed',(_axis,setting,expected)=>{
    const {m,c}=maximumTrainingFixture();const saved=JSON.stringify([m,c]);
    const t=applyTrainingConditions(m,c,conditions(setting));
    expect(t).toEqual({...c,members:[{...c.members[0]!,...expected}]});
    expect(JSON.stringify([m,c])).toBe(saved);
  });
  it('raises only Member Lv within the current cap; max uses the simulated training cap',()=>{
    const {m,c}=maximumTrainingFixture();
    expect(applyTrainingConditions(m,c,conditions({level:99}))).toEqual(c); // current training caps at 1
    c.members[0]!.trainingStage=2;
    expect(applyTrainingConditions(m,c,conditions({level:99}))).toEqual({...c,members:[{...c.members[0]!,level:2}]});
    c.members[0]!.trainingStage=1;
    expect(applyTrainingConditions(m,c,conditions({trainingStage:2,level:'max'})).members[0]).toEqual({...c.members[0]!,trainingStage:2,level:2});
  });
  it('raises only Snap rank or Lv and uses the simulated rank cap',()=>{
    const {m,c}=maximumTrainingFixture();
    expect(applyTrainingConditions(m,c,conditions({},{rank:2}))).toEqual({...c,snaps:c.snaps.map(s=>({...s,rank:2}))});
    expect(applyTrainingConditions(m,c,conditions({},{level:99}))).toEqual({...c,snaps:c.snaps.map(s=>({...s,level:2}))});
    expect(applyTrainingConditions(m,c,conditions({},{rank:'max',level:'max'})).snaps).toEqual(c.snaps.map(s=>({...s,rank:2,level:3})));
  });
  it('never lowers values above targets; skips nonexistent stages and levels',()=>{
    const {m,c}=maximumTrainingFixture();delete m.materialDefinition;delete m.rankDefinition;
    m.memberTraining[1]!.stage=4;m.memberLevelLimits.find(r=>r.trainingStage===2)!.trainingStage=4;
    m.memberAwakening[1]!.stage=4;m.memberAwakening[1]!.leaderSkillLevel=4;
    m.members[0]!.liveSkillLevels=[1,4,8];m.members[0]!.gekisouSkillLevels=[1,4,8];
    m.memberLevels[1]!.level=4;m.memberLevelLimits.find(r=>r.trainingStage===4)!.limitLevel=4;
    m.snapRanks[1]!.rank=4;m.snapRanks[1]!.supportSkillLevels=[4,4];
    validateCatalog(m);
    const t=applyTrainingConditions(m,c,conditions({trainingStage:3,awakeningStage:3,liveSkillLevel:3,gekisouSkillLevel:3,level:3},{rank:3,level:1}));
    expect(t).toEqual(c);
    const raised=applyTrainingConditions(m,c,conditions({trainingStage:6,awakeningStage:6,liveSkillLevel:6,gekisouSkillLevel:6,level:3},{rank:6,level:99}));
    expect(raised.members[0]).toEqual({...c.members[0]!,trainingStage:4,awakeningStage:4,liveSkillLevel:4,gekisouSkillLevel:4,level:1});
    expect(raised.snaps).toEqual(c.snaps.map(s=>({...s,rank:4,level:3})));
    expect(applyTrainingConditions(m,raised,conditions({trainingStage:2,awakeningStage:2,liveSkillLevel:2,gekisouSkillLevel:2,level:1},{rank:2,level:1}))).toEqual(raised);
    expect(applyTrainingConditions(m,c,conditions({trainingStage:'max',level:'max'})).members[0]!.level).toBe(4);
    expect(validateCollection(raised,m)).toEqual(raised);
  });
  it('implements no-copy maximum as a preset with independent PR24 toy expectations',()=>{
    const {m,c}=maximumTrainingFixture();const target=applyTrainingConditions(m,c,MAXIMUM_TRAINING);
    expect(target.members).toEqual([{cardId:8301,level:2,trainingStage:2,awakeningStage:1,liveSkillLevel:2,gekisouSkillLevel:2}]);
    expect(target.snaps).toEqual([{supportCardId:8501,level:2,rank:1},{supportCardId:8504,level:2,rank:1}]);
    expect(maximumTrainingTarget(m,c)).toEqual(target);
    const a=simulateTraining(m,c,MAXIMUM_TRAINING),b=simulateMaximumTraining(m,c);
    expect(a.after).toEqual(b.after);expect(a.materials).toEqual(b.materials);
    expect(a.after.rating).toBe(1276);expect(a.after.totalRank).toBe(5);
  });
  it('uses one target for costs, automatic ranks, bonus, rating and delayed bond theory',()=>{
    const {m,c}=maximumTrainingFixture();const saved=JSON.stringify([m,c]);
    const r=simulateTraining(m,c,conditions({trainingStage:2,level:'max'}));
    expect(r.target.members[0]).toEqual({...c.members[0]!,trainingStage:2,level:2});
    expect(r.materials.totals).toEqual([{resourceId:'member-exp',quantity:43},{resourceId:'paper',quantity:7}]);
    expect(r.materials.incomplete).toBe(false);
    expect(r.after.ranks.map(r=>r.effectiveRank)).toEqual([2,1]);expect(r.after.totalRank).toBe(3);
    expect(r.after.bonus).toMatchObject({bonus:0,source:'rules'});
    // P/T/V = 126/273/444, h=.04, rank2 => B=136+288+466=890.
    // Current Snap K=1.118 => floor(890*1.118)=995.
    expect(r.after.rating).toBe(995);
    expect(r.bondTheory(8101)).toMatchObject({status:'ready',characters:[{id:8201,finalRank:2},{id:8202,finalRank:1}],pairs:[{rank:1}]});
    expect(JSON.stringify([m,c])).toBe(saved);
  });
  it('includes explicit awakening and Snap copy costs without inventing Lv or skill dependencies',()=>{
    const {m,c}=maximumTrainingFixture();const r=simulateTraining(m,c,conditions({awakeningStage:'max'},{rank:'max'}));
    expect(r.target.members[0]).toEqual({...c.members[0]!,awakeningStage:2});
    expect(r.target.snaps).toEqual(c.snaps.map(s=>({...s,rank:2})));
    expect(r.materials.totals).toEqual([{resourceId:'copy',quantity:4},{resourceId:'paper',quantity:11}]);
    expect(r.materials.resources.find(r=>r.id==='copy')!.unit).toBe('card');
    m.materialDefinition!.bindings=m.materialDefinition!.bindings.filter(b=>b.axis!=='awakeningStage');
    const partial=simulateTraining(m,c,conditions({awakeningStage:2}));
    expect(partial.materials.incomplete).toBe(true);expect(partial.materials.totals).toEqual([]);
    expect(partial.materials.cards[0]!.axes.find(a=>a.axis==='awakeningStage')!.status).toBe('unavailable');
  });
  it('keeps manual ranks/bonus, missing definitions and unknown progress semantics',()=>{
    const {m,c}=maximumTrainingFixture();c.characterRanks={8201:3};c.totalRankBonus=0;delete c.characterProgress;
    const r=simulateTraining(m,c,MAXIMUM_TRAINING);
    expect(r.after.ranks[0]).toMatchObject({overrideRank:3,effectiveRank:3,estimatedRank:4});
    expect(r.after.bonus).toMatchObject({source:'manual',bonus:0});expect(r.bands[0]!.characters[0]!.rankDelta).toBeNull();
    expect(r.target.characterProgress).toBeUndefined();
    expect(r.bondTheory(8101)).toMatchObject({status:'ready',characters:[{id:8201,finalRank:4},{id:8202,finalRank:1}]});
    delete m.rankDefinition;delete m.materialDefinition;
    const p=simulateTraining(m,c,MAXIMUM_TRAINING);
    // Manual rank3 and bonus0 still resolve the only owned Member: floor((143+299+480)*1.32)=1217.
    expect(p.after.rating).toBe(1217);expect(p.after.totalRank).toBeNull();expect(p.materials.incomplete).toBe(true);
    expect(p.bondTheory(8101).status).toBe('pending');
  });
  it('retains the legacy adapter while new export uses cap levels and ordinary projected ranks',()=>{
    const {m,c}=maximumTrainingFixture();c.members[0]!.trainingStage=2;
    const t=applyTrainingConditions(m,c,legacyTrainingConditions(DEFAULT_TRAINING));
    expect(t.members[0]!.level).toBe(1);expect(t.snaps).toEqual(c.snaps);
    c.members[0]!.trainingStage=1;
    const legacy=applyHypotheticalTraining(m,c,DEFAULT_TRAINING);
    expect(legacy.members[0]!.level).toBe(2);expect(legacy.snaps).toEqual(c.snaps.map(s=>({...s,level:2})));
    const output=prepareExport(m,c,{applyTraining:true,training:DEFAULT_TRAINING});
    expect(output.data.members).toEqual(legacy.members);expect(output.data.snaps).toEqual(c.snaps.map(s=>({...s,level:2})));
    expect(output.data.ranks).toEqual([{id:8201,value:4},{id:8202,value:1}]);expect(output.totalRank).toBe(5);
    expect(simulateTraining(m,c,legacyTrainingConditions(DEFAULT_TRAINING)).after.totalRank).toBe(5);
  });
  it('rejects malformed conditions and invalid ownership instead of repairing it',()=>{
    for(const bad of [null,{},[],{...KEEP_TRAINING,extra:1},conditions({level:0}),conditions({level:1.5}),conditions({level:NaN}),conditions({level:Number.MAX_SAFE_INTEGER+1}),{member:{...KEEP_TRAINING.member},snap:{rank:null,level:'maxIfTrainingRaised'}}])expect(()=>validateTrainingConditions(bad)).toThrow();
    const {m,c}=maximumTrainingFixture();c.members[0]!.level=999;
    expect(()=>applyTrainingConditions(m,c,MAXIMUM_TRAINING)).toThrow();
  });
});
