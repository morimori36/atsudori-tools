import {describe,it,expect} from 'vitest';
import {economyFixture,grant,reward} from '../helpers/economy';
import {calculateEconomy} from '../../src/domain/economy/calculate';
import {defaultStarBudgetScenario} from '../../src/domain/star-budget/model';
const fixture=()=>{const f=economyFixture();f.supply.standardEvent!.cumulative=reward();f.supply.standardEvent!.limited=reward();return f;};
const run=(f:ReturnType<typeof fixture>)=>calculateEconomy(f.m,f.c,f.requirements);
const paper=(f:ReturnType<typeof fixture>)=>run(f).rows.find(r=>r.resource.id==='paper')!;
describe('normal live and shared supply conditions',()=>{
 it.each([['Alto',42],['Bass',102]])('uses normal %s rewards and the defined LB multiplier',(scoreRank,expected)=>{
  const f=fixture();f.c.supplyConditions={lbPerDay:2,scoreRank,studioLevels:[]};expect(paper(f).confirmedDaily).toBe(expected);
 });
 it('does not count per-play direct EXP or skip rewards',()=>{
  const f=fixture();f.c.supplyConditions={lbPerDay:2,scoreRank:'Alto',studioLevels:[]};
  const r=run(f);expect(r.rows.find(r=>r.resource.id==='member-exp')!.dailySupply).toBe(66);
  expect(r.breakdown.some(e=>e.destination==='direct'||e.sourceId==='skip')).toBe(false);
 });
 it('excludes unknown per-play contributions while retaining known rewards',()=>{
  const f=fixture();f.c.supplyConditions={lbPerDay:2,scoreRank:'Alto',studioLevels:[]};f.supply.lives[0]!.perPlay=reward(grant('paper',4));
  expect(paper(f)).toMatchObject({knownDailySupply:42,dailySupply:42});
 });
 it('requires a unique normal score rank only when LB is consumed',()=>{
  const f=fixture();expect(run(f).issues).toHaveLength(0);f.c.supplyConditions!.lbPerDay=2;
  expect(paper(f).dailySupply).toBe(0);f.c.supplyConditions!.scoreRank='Alto';
  f.supply.lives.push({...f.supply.lives[0]!,id:'duplicate'});expect(()=>paper(f)).toThrow('重複');
 });
 it('retains missing inventory state while computing known supply',()=>{
  const f=fixture();delete f.c.resourceInventory!['member-exp'];f.c.supplyConditions={lbPerDay:1,scoreRank:'Alto',studioLevels:[]};
  f.supply.lives[0]!.perLb.unavailable.push({reason:'架空の抽選条件不明',resourceIds:['paper']});
  expect(paper(f)).toMatchObject({knownDailySupply:21,dailySupply:21,clearanceDays:96});
  expect(run(f).rows.find(r=>r.resource.id==='member-exp')!.stock).toBeNull();
 });
 it.each([[false,false,10],[true,false,30],[false,true,50],[true,true,70]])('fully collects free tracks and only purchased additions: %s %s',(eventPremium,seasonPremium,expected)=>{
  const f=fixture();f.c.starBudgetScenario={...defaultStarBudgetScenario(),eventPremium,seasonPremium};
  f.supply.fixedSources.forEach((s,i)=>{s.rewards=reward(grant('paper',[20,200,240,1200][i]!));});
  // Free event 20/10 + free season 240/30 = 10/day; additions 20 and 40/day.
  expect(paper(f).dailySupply).toBe(expected);
 });
 it('marks missing free definitions and purchased Premium definitions unknown',()=>{
  const f=fixture();f.supply.fixedSources=f.supply.fixedSources.filter(s=>s.id!=='event-pass-premium');
  expect(paper(f).dailySupply).toBe(0);f.c.starBudgetScenario={...defaultStarBudgetScenario(),eventPremium:true};expect(paper(f).dailySupply).toBe(0);
 });
 it('retains unscoped uncertainty and does not let direct-only uncertainty block inventory',()=>{
  const f=fixture(),s=f.supply.fixedSources.find(s=>s.id==='season-pass-free')!;
  s.intervalDays=null;s.rewards={...reward(grant('paper',70)),unavailable:[{reason:'対象不明',resourceIds:[]}]};
  expect(run(f).rows.every(r=>r.dailySupply===0)).toBe(true);
  s.rewards.unavailable=[{reason:'直接付与のみ不明',resourceIds:[],destination:'direct'}];
  expect(run(f).rows.find(r=>r.resource.id==='member-exp')!.dailySupply).toBe(0);
 });
});
describe('normal-efficiency studio collection cycles',()=>{
 it('floors fixed rewards and draws once per full normal cycle',()=>{
  const f=fixture();f.c.supplyConditions!.studioLevels=[{bandId:8101,level:8}];
  // 10 ticks/cycle: floor(3*7/4*10)=52; floor(2*7/4*10)=35 draws.
  // 12 cycles/day: fixed 624, expected 35*(1/4)*2*12=210.
  expect(paper(f)).toMatchObject({confirmedDaily:624,expectedDaily:210,dailySupply:834,clearanceDays:3});
 });
 it.each([1,2,4])('handles cycle and multiplier boundaries %s',(numerator)=>{
  const f=fixture();f.c.supplyConditions!.studioLevels=[{bandId:8101,level:8}];
  f.supply.ranks[0]!.studioMultiplier={numerator,denominator:4};
  f.supply.studios[0]!.normalMinutes=36;
  // Three ticks/claim, 40 claims/day. Both fixed quantity and draw count floor per claim.
  expect(paper(f).confirmedDaily).toBe(Math.floor(9*numerator/4)*40);
  expect(paper(f).expectedDaily).toBe(Math.floor(6*numerator/4)*20);
 });
 it('keeps known supply with missing rank and does not mutate unknown state',()=>{
  const f=fixture();f.c.supplyConditions!.studioLevels=[{bandId:8101,level:8}];delete f.c.tgwRank;
  const before=JSON.stringify(f);expect(paper(f).dailySupply).toBe(0);expect(run(f).issues.length).toBeGreaterThan(0);expect(JSON.stringify(f)).toBe(before);
 });
});
it.each([1,2,10])('adds exclusive and single-outcome lottery expectations for daily LB %s',lb=>{
 const f=fixture();f.c.supplyConditions={lbPerDay:lb,scoreRank:'Alto',studioLevels:[]};
 f.supply.lives[0]!.perLb.lotteries=[{draws:{numerator:1,denominator:1},totalWeight:8,outcomes:[{weight:3,rewards:[grant('paper',4)]},{weight:5,rewards:[]}]},{draws:{numerator:1,denominator:1},totalWeight:20,outcomes:[{weight:1,rewards:[grant('paper',10)]},{weight:19,rewards:[]}]}];
 // Base 7 plus 4*3/8 + 10/20 = 9, then fixture multiplier 3 times daily LB.
 expect(paper(f)).toMatchObject({confirmedDaily:21*lb,expectedDaily:6*lb,dailySupply:27*lb});
});
