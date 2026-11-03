import { expect,test } from 'vitest';
import { createCharacterExpScenarios,legalExpTarget } from '../../src/app/character-exp-scenarios';
import type { ExpResult } from '../../src/app/character-exp-scenarios';
import { characterExpFixture,expTraining } from '../helpers/character-exp';
import { applyTrainingConditions } from '../../src/app/training-conditions';
import { trainingConditions } from '../../src/app/hypothetical-training';
import { estimateCharacterRanks } from '../../src/domain/character-rank/estimate';
import { validateCatalog } from '../../src/data/catalog/validate';

function ready<T>(r:ExpResult<T>):T {if(r.status==='pending')throw new Error(r.reason);return r.value;}
test('owned and acquired summaries use separate simultaneous scenarios, never sums of independent gains',()=>{
  const {m,c}=characterExpFixture();validateCatalog(m);
  const s=createCharacterExpScenarios(m,c,expTraining);
  const a=s.summary(8201,30),b=s.summary(8202,30);
  expect(ready(a.owned)).toBe(44); // 11+13+3+17; ownership/manual counters stay fixed.
  expect(ready(a.unowned)).toBe(56); // 5+7+11+13+3+17 after adding all four missing cards.
  expect(ready(b.owned)).toBe(17);expect(ready(b.unowned)).toBe(24); // shared Snaps: 7+17
  for(const owned of [true,false])expect(s.cards(8201,owned).map(card=>ready(s.direct(card,8201)))).toEqual([0,0,0,0]);
  expect(s.cards(8202,false)).toHaveLength(2);
  const trained=applyTrainingConditions(m,c,trainingConditions(expTraining));
  const direct=(source:typeof c)=>estimateCharacterRanks(m,source).find(r=>r.id===8201)!.details.filter(d=>d.definition.kind!=='bondRankTotal').reduce((n,d)=>n+d.exp,0);
  expect(direct(c)).toBe(21);expect(direct(trained)).toBe(65);
});
test('target uses cumulative EXP after bond convergence, including shared Snap effects and non-default goals',()=>{
  const {m,c}=characterExpFixture();const s=createCharacterExpScenarios(m,c,expTraining);
  expect(ready(s.summary(8201,30).goal)).toEqual({rank:30,exp:67,missingExp:0,reached:true});
  expect(ready(s.summary(8201,32).goal)).toEqual({rank:30,exp:67,missingExp:13,reached:false});
  expect(ready(s.summary(8202,28).goal)).toEqual({rank:28,exp:26,missingExp:0,reached:true});
  const snap=s.cards(8201,false).find(c=>c.kind==='snap')!;
  expect(ready(s.detail(snap,8202,30).goal)).toEqual({rank:28,exp:26,missingExp:4,reached:false});
  expect(legalExpTarget(m)).toBe(30);expect(legalExpTarget(m,32)).toBe(32);
  m.characterRankLevels=[1,28,32];expect(legalExpTarget(m)).toBe(28);
  expect(s.summary(8201,29).goal.status).toBe('pending');
});
test('one acquired card recomputes bond feedback for other characters and separates indirect EXP',()=>{
  const {m,c}=characterExpFixture();m.characterRankLevels=[1,2,3,4];
  m.members[1]!.characterId=8202;c.members=[c.members[0]!];
  m.rankDefinition!.achievements=[{id:'members',kind:'members',label:'架空紙',stage:null,thresholds:[1],exp:5},{id:'bond',kind:'bondRankTotal',label:'架空絆',stage:null,thresholds:[2,3],exp:5}];
  m.rankDefinition!.manualProgress=[{key:'bondRankTotal',label:'架空絆'}];
  m.rankDefinition!.rankThresholds=[0,5,10,15].map((exp,i)=>({rank:i+1,exp}));
  const s=createCharacterExpScenarios(m,c,expTraining),card=s.cards(8202,false).find(c=>c.kind==='member')!;
  expect(ready(s.summary(8201,4).goal).rank).toBe(2);
  expect(ready(s.summary(8202,4).goal).rank).toBe(1);
  expect(ready(s.detail(card,8202,4).direct)).toBe(5);
  expect(ready(s.detail(card,8202,4).indirect)).toBe(10);
  expect(ready(s.detail(card,8202,4).goal)).toEqual({rank:4,exp:15,missingExp:0,reached:true});
  expect(ready(s.detail(card,8201,4).direct)).toBe(0);
  expect(ready(s.detail(card,8201,4).goal).rank).toBe(4);
});
test('keep targets preserve axes, legal caps and manual data; no source or settings mutation',()=>{
  const {m,c}=characterExpFixture();const settings={trainingStage:null,awakeningStage:null,liveSkillLevel:null,gekisouSkillLevel:null,snapRank:null};
  const original=JSON.stringify([m,c,settings]);const s=createCharacterExpScenarios(m,c,settings);
  expect(ready(s.summary(8201,30).owned)).toBe(0);
  for(const card of s.cards(8201,true)) {
    const r=s.detail(card,8201,30);expect(ready(r.after)).toEqual(r.before);expect(ready(r.direct)).toBe(0);
  }
  expect(JSON.stringify([m,c,settings])).toBe(original);
  const max=createCharacterExpScenarios(m,c,{...expTraining,trainingStage:5,awakeningStage:5,snapRank:5});
  expect(ready(max.detail(max.cards(8201,false)[0]!,8201,30).after)).toMatchObject({level:2,trainingStage:2,awakeningStage:2});
  expect(JSON.stringify([m,c,settings])).toBe(original);
});
test('acquisition and single-card training use existing counts at every threshold',()=>{
  const {m,c}=characterExpFixture();c.members=[c.members[0]!];c.snaps=[c.snaps[0]!];
  const s=createCharacterExpScenarios(m,c,expTraining);
  const member=s.cards(8201,false).find(c=>c.kind==='member')!;
  // The existing member is already trained: adding one crosses training/awakening and five skill counters.
  expect(ready(s.detail(member,8201,30).direct)).toBe(27); // 11+13+3
  const snap=s.cards(8201,false).find(c=>c.kind==='snap')!;
  expect(ready(s.detail(snap,8201,30).direct)).toBe(17);
  expect(ready(s.detail(snap,8202,30).direct)).toBe(17);
});
test('missing rules or legal acquisition rows produce pending values without partial aggregate success',()=>{
  const {m,c}=characterExpFixture();delete m.rankDefinition;
  let s=createCharacterExpScenarios(m,c,expTraining);
  expect(s.summary(8201,30).owned.status).toBe('pending');expect(s.summary(8201,30).goal.status).toBe('pending');
  const fixture=characterExpFixture();fixture.m.members[2]!.trainingGroup=9999;
  s=createCharacterExpScenarios(fixture.m,fixture.c,expTraining);
  expect(s.summary(8201,30).unowned.status).toBe('pending');
  expect(s.detail(s.cards(8201,false)[0]!,8201,30).after.status).toBe('pending');
});
