import { describe,it,expect } from 'vitest';
import { economyFixture,grant,reward } from '../helpers/economy';
import { calculateEconomy } from '../../src/domain/economy/calculate';
import { simulateEconomy } from '../../src/app/economy-simulation';
import { opportunities,period } from '../../src/domain/economy/time';
import { DEFAULT_TRAINING } from '../../src/app/hypothetical-training';

const run=(f:ReturnType<typeof economyFixture>)=>calculateEconomy(f.m,f.c.resourceInventory!,f.requirements,f.scenario);
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
describe('event and currency accounting',()=>{
  const selectEvent=(f:ReturnType<typeof economyFixture>,points:number|null=180)=>f.scenario.events.push({eventId:'festival-a',claimDate:'2024-01-01',points,fullCollection:true,buyLimited:true});
  it('separates cumulative, repeat currency, and limited exchange without automatic unlimited exchange',()=>{
    const f=economyFixture();selectEvent(f);const r=run(f);
    expect(row(r,'festival').conditionalIncome).toBe(8+9+22);expect(row(r,'festival').spent).toBe(15);expect(row(r,'festival').fixedStock).toBe(24);
    expect(row(r).conditionalIncome).toBe(4+21);expect(r.ledger.some(e=>e.sourceId==='event-unlimited')).toBe(false);
  });
  it('only converts surplus through an explicit unlimited purchase policy',()=>{
    const f=economyFixture();selectEvent(f);f.scenario.purchases.push({offerId:'event-unlimited',quantity:24,alreadyPurchased:0});
    const r=run(f);expect(row(r,'festival').fixedStock).toBe(0);expect(row(r).conditionalIncome).toBe(73);
  });
  it('retains unknown repeat quantities and does not assume a repeat count',()=>{
    const f=economyFixture();selectEvent(f,null);const r=run(f);
    expect(row(r,'festival').conditionalIncome).toBe(17);expect(row(r,'festival').supplyIncomplete).toBe(true);expect(row(r,'festival').estimatedStock).toBeNull();
  });
  it('uses each event own milestone and repeat settings',()=>{
    const f=economyFixture();const e=f.supply.events[0]!;f.supply.events.push({...e,id:'festival-b',name:'架空の祭りB',milestones:[{points:30,excludeOnFullCollection:false,rewards:reward(grant('festival',6))}],repeat:{startsAfter:30,everyPoints:15,rewards:reward(grant('festival',4))}});
    f.scenario.events.push({eventId:'festival-b',claimDate:'2024-01-01',points:60,fullCollection:true,buyLimited:false});
    expect(row(run(f),'festival').conditionalIncome).toBe(14);
  });
  it('keeps unspecified partial event progress unknown instead of reporting no rewards',()=>{
    const f=economyFixture();f.supply.events[0]!.repeat=null;
    f.scenario.events.push({eventId:'festival-a',claimDate:'2024-01-01',points:null,fullCollection:false,buyLimited:false});
    const r=run(f);expect(row(r).estimatedStock).toBeNull();expect(r.issues[0]!.reason).toContain('到達pt');
  });
  it.each(['tokens-b','voucher','festival'])('rejects purchases exceeding %s balance',id=>{
    const f=economyFixture();const offer=f.supply.offers[0]!;offer.minimumRank=null;offer.costs=[{resourceId:id,quantity:1}];
    f.scenario.purchases.push({offerId:offer.id,quantity:1,alreadyPurchased:0});const r=run(f);
    expect(row(r,id).fixedStock).toBe(0);expect(row(r).confirmedIncome).toBe(0);expect(r.issues.some(i=>i.reason.includes('残高不足'))).toBe(true);
  });
  it('does not finance purchases with expected lottery income or a different currency',()=>{
    const f=economyFixture();f.c.resourceInventory!['tokens-a']=999;
    f.supply.ranks[0]!.daily={...reward(),lotteries:[{draws:{numerator:1,denominator:1},totalWeight:1,outcomes:[{weight:1,rewards:[grant('tokens-b',100)]}]}]};
    f.scenario.dailyClaims=1;f.scenario.purchases.push({offerId:'catalog-paper',quantity:1,alreadyPurchased:0});
    const r=run(f);expect(row(r,'tokens-b').expectedIncome).toBe(100);expect(row(r,'tokens-b').spent).toBe(0);expect(row(r,'tokens-a').fixedStock).toBe(999);
  });
  it('prevents double spending between gacha, reserves, and shop',()=>{
    const f=economyFixture();f.c.resourceInventory!['tokens-b']=14;
    f.scenario.allocations=[{id:'gacha',name:'架空ガチャ用',date:'2024-01-01',purpose:'gacha',costs:[{resourceId:'tokens-b',quantity:7}]},
      {id:'future',name:'架空の確保',date:'2024-01-01',purpose:'reserve',costs:[{resourceId:'tokens-b',quantity:7}]}];
    f.scenario.purchases=[{offerId:'catalog-paper',quantity:1,alreadyPurchased:0}];
    const r=run(f);expect(row(r,'tokens-b').spent).toBe(7);expect(row(r,'tokens-b').reserved).toBe(7);expect(row(r,'tokens-b').fixedStock).toBe(0);expect(row(r).confirmedIncome).toBe(0);
  });
  it('never spends future income at an earlier reset opportunity',()=>{
    const f=economyFixture();f.scenario.endDate='2024-01-08';f.scenario.purchases=[{offerId:'catalog-paper',quantity:1,alreadyPurchased:0}];
    f.scenario.externalIncome.push({id:'later',name:'後日の架空収入',date:'2024-01-07',amounts:[{resourceId:'tokens-b',quantity:7}]});
    const r=run(f);expect(row(r).conditionalIncome).toBe(13);expect(r.issues).toHaveLength(1);expect(r.ledger.find(e=>e.sourceId==='catalog-paper')!.at).toBe('2024-01-08T00:00:00.000Z');
  });
  it('requires known starting currency before spending and checks whole multi-resource purchases atomically',()=>{
    const f=economyFixture();delete f.c.resourceInventory!['tokens-b'];f.c.resourceInventory!['voucher']=10;
    f.supply.offers[0]!.costs.push({resourceId:'voucher',quantity:2});f.scenario.purchases=[{offerId:'catalog-paper',quantity:1,alreadyPurchased:0}];
    const r=run(f);expect(row(r,'voucher').fixedStock).toBe(10);expect(row(r,'tokens-b').spent).toBe(0);expect(r.issues[0]!.reason).toContain('未登録');
  });
});
describe('calendar, pass rights and invariants',()=>{
  it('counts five weekly opportunities in a 30 day period and respects already used quota',()=>{
    const f=economyFixture();f.scenario.endDate='2024-01-30';f.c.resourceInventory!['tokens-b']=1000;
    f.scenario.purchases=[{offerId:'catalog-paper',quantity:3,alreadyPurchased:1}];
    const r=run(f);expect(row(r).confirmedIncome).toBe(12*13);expect(r.issues[0]!.reason).toContain('購入上限');
  });
  it('counts monthly resets through leap-day and clips the exclusive endpoint',()=>{
    const p=period('2024-01-31','2024-02-29',540);
    expect(p.days).toBe(30);expect(opportunities(p.start,p.end,{kind:'monthly',hour:0,day:1},540)).toHaveLength(2);
    const q=period('2024-01-31','2024-01-31',540);expect(opportunities(q.start,q.end,{kind:'monthly',hour:0,day:1},540)).toHaveLength(1);
  });
  it('counts a reset within the first local day as a new window',()=>{
    const p=period('2024-01-01','2024-01-01',540);
    expect(opportunities(p.start,p.end,{kind:'weekly',hour:4,weekday:1},540)).toHaveLength(2);
  });
  it('posts paid and free currencies separately and keeps free draws as rights',()=>{
    const f=economyFixture();f.scenario.endDate='2024-01-09';
    f.scenario.pass={passId:'short-pass',startsOn:'2024-01-01',claimDates:Array.from({length:9},(_,i)=>'2024-01-0'+(i+1))};
    const before=JSON.stringify(f);const r=run(f);
    expect(r.cashCostYen).toBe(73);expect(row(r,'tokens-a').conditionalIncome).toBe(17);expect(row(r,'tokens-b').conditionalIncome).toBe(27);
    expect(r.entitlements.reduce((n,e)=>n+e.quantity,0)).toBe(13);expect(row(r,'draw-right').fixedStock).toBe(0);expect(JSON.stringify(f)).toBe(before);
  });
  it('retains known pass currency income while weekly entitlement timing is unknown',()=>{
    const f=economyFixture();f.supply.passes[0]!.weeklyReset=null;
    f.scenario.pass={passId:'short-pass',startsOn:'2024-01-01',claimDates:['2024-01-01']};
    const r=run(f);expect(row(r,'tokens-a').estimatedStock).toBe(17);expect(row(r,'tokens-b').estimatedStock).toBe(3);expect(r.issues[0]!.blocksProjection).toBe(false);
  });
  it('supports explicitly free selected offers without inferring a missing price',()=>{
    const f=economyFixture();f.supply.offers[0]!.costs=[];f.scenario.purchases=[{offerId:'catalog-paper',quantity:1,alreadyPurchased:0}];
    expect(row(run(f)).confirmedIncome).toBe(13);
  });
  it('clips pass daily and weekly rewards to the actual contract',()=>{
    const f=economyFixture();f.scenario.endDate='2024-01-30';f.scenario.pass={passId:'short-pass',startsOn:'2024-01-01',claimDates:['2024-01-01']};
    const r=run(f);expect(row(r,'tokens-b').conditionalIncome).toBe(3);expect(r.entitlements.filter(e=>e.sourceName.includes('週次')).reduce((n,e)=>n+e.quantity,0)).toBe(4);
    f.scenario.pass.claimDates=['2024-01-10'];expect(()=>run(f)).toThrow('契約期間');
  });
  it('retains one-time and paid fixed sources as distinct selected rewards',()=>{
    const f=economyFixture();f.scenario.endDate='2024-01-03';
    f.supply.fixedSources.push({id:'single',name:'架空の一度きり報酬',basis:'架空の固定供給',category:'oneTime',reset:{kind:'once',hour:0},window:null,rewards:reward(grant('paper',6)),priceYen:0},
      {id:'purchase',name:'架空の購入品',basis:'架空の固定供給',category:'paid',reset:{kind:'once',hour:0},window:null,rewards:reward(grant('paper',9)),priceYen:23});
    f.scenario.fixedSources=[{sourceId:'single',claims:1},{sourceId:'purchase',claims:1}];const r=run(f);expect(row(r).conditionalIncome).toBe(15);expect(r.cashCostYen).toBe(23);
    f.scenario.fixedSources[0]!.claims=2;expect(()=>run(f)).toThrow('機会');
  });
  it('reuses the training and inventory functions without modifying collection or definitions',()=>{
    const f=economyFixture(),before=JSON.stringify(f);const r=simulateEconomy(f.m,f.c,{...DEFAULT_TRAINING},f.scenario);
    expect(row(r).required).toBe(20);expect(r.requirementsIncomplete).toBe(true);expect(row(r).estimatedShortage).toBeNull();expect(JSON.stringify(f)).toBe(before);
  });
  it('rejects arithmetic overflow instead of displaying a rounded integer',()=>{
    const f=economyFixture();f.supply.lives[0]!.perLb.fixed[0]!.quantity=Number.MAX_SAFE_INTEGER;
    Object.assign(f.scenario.live,{enabled:true,playId:'alto',lbPerDay:1,playsPerDay:0,skipsPerDay:0});expect(()=>run(f)).toThrow('整数');
  });
});
