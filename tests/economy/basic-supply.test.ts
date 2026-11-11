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
 it('does not turn per-play inventory rewards into an assumed zero',()=>{
  const f=fixture();f.c.supplyConditions={lbPerDay:2,scoreRank:'Alto',studioLevels:[]};f.supply.lives[0]!.perPlay=reward(grant('paper',4));
  expect(paper(f)).toMatchObject({knownDailySupply:42,dailySupply:null});
 });
 it('requires a unique normal score rank only when LB is consumed',()=>{
  const f=fixture();expect(run(f).issues).toHaveLength(0);f.c.supplyConditions!.lbPerDay=2;
  expect(paper(f).dailySupply).toBeNull();f.c.supplyConditions!.scoreRank='Alto';
  f.supply.lives.push({...f.supply.lives[0]!,id:'duplicate'});expect(paper(f).dailySupply).toBeNull();
 });
 it('keeps missing inventory and uncertain lottery supply unknown',()=>{
  const f=fixture();delete f.c.resourceInventory!['member-exp'];f.c.supplyConditions={lbPerDay:1,scoreRank:'Alto',studioLevels:[]};
  f.supply.lives[0]!.perLb.unavailable.push({reason:'架空の抽選条件不明',resourceIds:['paper']});
  expect(paper(f)).toMatchObject({knownDailySupply:21,dailySupply:null,clearanceDays:null});
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
  expect(paper(f).dailySupply).toBe(0);f.c.starBudgetScenario={...defaultStarBudgetScenario(),eventPremium:true};expect(paper(f).dailySupply).toBeNull();
 });
 it('retains unscoped uncertainty and does not let direct-only uncertainty block inventory',()=>{
  const f=fixture(),s=f.supply.fixedSources.find(s=>s.id==='season-pass-free')!;
  s.intervalDays=null;s.rewards={...reward(grant('paper',70)),unavailable:[{reason:'対象不明',resourceIds:[]}]};
  expect(run(f).rows.every(r=>r.dailySupply===null)).toBe(true);
  s.rewards.unavailable=[{reason:'直接付与のみ不明',resourceIds:[],destination:'direct'}];
  expect(run(f).rows.find(r=>r.resource.id==='member-exp')!.dailySupply).toBe(0);
 });
});
describe('24-hour studio supply without receipt conditions',()=>{
 it('excludes unset levels and includes only selected bands',()=>{
  const f=fixture();expect(paper(f).dailySupply).toBe(0);
  f.c.supplyConditions!.studioLevels=[{bandId:8101,level:8}];f.supply.studios[0]!.rounding='tick';
  // 120 ticks/day: floor(3 * 7/4)=5 fixed and (2*7/4)*(1/4)*2=1.75 expected per tick.
  expect(paper(f)).toMatchObject({confirmedDaily:600,expectedDaily:210,dailySupply:810,clearanceDays:3});
 });
 it('uses each band table independently',()=>{
  const f=fixture();f.m.bands.push({id:8102,name:'独立した架空バンドB'});
  f.supply.studios[0]!.rounding='tick';f.supply.studios.push({...f.supply.studios[0]!,bandId:8102,rewards:reward(grant('member-exp',4))});
  f.c.supplyConditions!.studioLevels=[{bandId:8101,level:8},{bandId:8102,level:8}];
  expect(paper(f).dailySupply).toBe(810);expect(run(f).rows.find(r=>r.resource.id==='member-exp')!.dailySupply).toBe(840);
 });
 it.each([null,'claim'] as const)('does not invent a receipt interval for %s rounding',(rounding)=>{
  const f=fixture();f.c.supplyConditions!.studioLevels=[{bandId:8101,level:8}];f.supply.studios[0]!.rounding=rounding;
  expect(paper(f).dailySupply).toBeNull();expect(run(f).issues[0]!.reason).toContain(rounding===null?'端数処理':'受取単位');
 });
 it('supports claim rounding when exact ticks eliminate receipt dependence',()=>{
  const f=fixture();f.c.supplyConditions!.studioLevels=[{bandId:8101,level:8}];f.supply.ranks[0]!.studioMultiplier={numerator:2,denominator:1};
  expect(paper(f)).toMatchObject({confirmedDaily:720,expectedDaily:240,dailySupply:960});
 });
 it('uses the shared rank and keeps missing multipliers or invalid levels unknown',()=>{
  const f=fixture();f.c.supplyConditions!.studioLevels=[{bandId:8101,level:8}];delete f.c.tgwRank;
  expect(paper(f).dailySupply).toBeNull();f.c.tgwRank=6;f.c.supplyConditions!.studioLevels[0]!.level=999;
  expect(run(f).issues[0]!.reason).toContain('練習Lv');expect(paper(f).dailySupply).toBeNull();
 });
});
