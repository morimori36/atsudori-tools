import { describe,it,expect } from 'vitest';
import { economyFixture,grant,reward } from '../helpers/economy';
import { calculateEconomy } from '../../src/domain/economy/calculate';

const run=(f:ReturnType<typeof economyFixture>)=>calculateEconomy(f.m,f.c.resourceInventory!,f.requirements,{...f.scenario,includeEvents:false});
const row=(r:ReturnType<typeof run>,id='paper')=>r.rows.find(r=>r.resource.id===id)!;
describe('live, practice and unknown supply',()=>{
  it.each([['alto',21],['bass',51]])('uses the selected base reward and LB multiplier: %s',(id,expected)=>{
    const f=economyFixture();Object.assign(f.scenario.live,{enabled:true,playId:id,lbPerDay:1,playsPerDay:0,skipsPerDay:0});
    expect(row(run(f)).confirmedIncome).toBe(expected);
  });
  it('keeps direct EXP separate from stock EXP',()=>{
    const f=economyFixture();Object.assign(f.scenario.live,{enabled:true,playId:'alto',lbPerDay:2,playsPerDay:3,skipsPerDay:0});
    const r=run(f);expect(row(r,'member-exp').confirmedIncome).toBe(66);expect(row(r,'member-exp').fixedStock).toBe(66);
    expect(r.directRewards.reduce((n,e)=>n+e.quantity,0)).toBe(57);
  });
  it('apportions whole LB and uses the independent skip table',()=>{
    const f=economyFixture();Object.assign(f.scenario.live,{enabled:true,playId:'bass',skipId:'skip',lbPerDay:9,skipPercent:33,playsPerDay:0,skipsPerDay:0});
    expect(row(run(f)).confirmedIncome).toBe(7*51+2*6);
  });
  it('applies a rational bonus to both fixed yields and lottery draws',()=>{
    const f=economyFixture();Object.assign(f.scenario.studio,{enabled:true,levels:[{bandId:8101,level:8}],minutesPerDay:25});
    const r=run(f);expect(row(r).confirmedIncome).toBe(10);expect(row(r).expectedIncome).toBe(3.5);
    expect(row(r).fixedStock).toBe(10);expect(row(r).estimatedStock).toBe(13.5);expect(row(r).estimatedShortage).toBe(1986.5);
  });
  it('uses each band lottery rather than reusing one band table',()=>{
    const f=economyFixture();f.m.bands.push({id:8102,name:'独立した架空バンドB'});
    f.supply.studios.push({...f.supply.studios[0]!,bandId:8102,rewards:{...reward(),lotteries:[{draws:{numerator:1,denominator:1},totalWeight:1,outcomes:[{weight:1,rewards:[grant('member-exp',3)]}]}]}});
    Object.assign(f.scenario.studio,{enabled:true,levels:[{bandId:8101,level:8},{bandId:8102,level:8}],minutesPerDay:25});
    const r=run(f);expect(row(r).expectedIncome).toBe(3.5);expect(row(r,'member-exp').expectedIncome).toBe(10.5);
  });
  it.each([['claim',52],['tick',50]] as const)('respects declared %s rounding',(rounding,expected)=>{
    const f=economyFixture();f.supply.studios[0]!.rounding=rounding;
    Object.assign(f.scenario.studio,{enabled:true,levels:[{bandId:8101,level:8}],minutesPerDay:120});
    expect(row(run(f)).confirmedIncome).toBe(expected);
  });
  it('discards incomplete ticks separately at every collection',()=>{
    const f=economyFixture();Object.assign(f.scenario.studio,{enabled:true,levels:[{bandId:8101,level:8}],minutesPerDay:35,claimEveryMinutes:11});
    expect(row(run(f)).confirmedIncome).toBe(0);
  });
  it('normalizes hourly fractional rewards before rounding and does not turn missing direct EXP into inventory uncertainty',()=>{
    const f=economyFixture();f.supply.studios[0]!.rewardScale={numerator:1,denominator:5};
    Object.assign(f.scenario.studio,{enabled:true,levels:[{bandId:8101,level:8}],minutesPerDay:25});
    const r=run(f);expect(row(r).confirmedIncome).toBe(2);expect(row(r).expectedIncome).toBeCloseTo(.7);
    f.scenario.studio.enabled=false;Object.assign(f.scenario.live,{enabled:true,playId:'alto',lbPerDay:1,playsPerDay:1,skipsPerDay:0});
    f.supply.lives[0]!.perPlay={...reward(),unavailable:[{reason:'直接付与の条件不明',resourceIds:['member-exp'],destination:'direct'}]};
    const direct=run(f);expect(row(direct,'member-exp').estimatedStock).toBe(33);expect(row(direct).supplyIncomplete).toBe(false);
  });
  it.each([[180,65],[300,78]])('applies the reduced rate and cap for %i minutes',(minutes,expected)=>{
    const f=economyFixture();Object.assign(f.scenario.studio,{enabled:true,levels:[{bandId:8101,level:8}],minutesPerDay:minutes});
    expect(row(run(f)).confirmedIncome).toBe(expected);
  });
  it('shows a known subtotal and unknown final result for missing overflow rules',()=>{
    const f=economyFixture();f.supply.studios[0]!.overflowRate=null;
    Object.assign(f.scenario.studio,{enabled:true,levels:[{bandId:8101,level:8}],minutesPerDay:180});
    const r=run(f);expect(row(r).confirmedIncome).toBe(52);expect(row(r).estimatedStock).toBeNull();expect(r.issues).toHaveLength(1);
  });
  it('does not turn unknown starting stock or a missing lottery definition into zero',()=>{
    const f=economyFixture();delete f.c.resourceInventory!['member-exp'];
    Object.assign(f.scenario.live,{enabled:true,playId:'alto',lbPerDay:1,playsPerDay:0,skipsPerDay:0});
    f.supply.lives[0]!.perLb.unavailable.push({reason:'架空の未確認抽選',resourceIds:['paper']});
    const r=run(f);expect(row(r,'member-exp').stock).toBeNull();expect(row(r,'member-exp').estimatedShortage).toBeNull();
    expect(row(r).confirmedIncome).toBe(21);expect(row(r).supplyIncomplete).toBe(true);expect(row(r).estimatedShortage).toBeNull();
  });
});
