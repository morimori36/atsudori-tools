import { materialFixture } from './materials';
import type { Grant, Rewards, SupplyDefinition } from '../../src/domain/economy/model';
import { emptyEconomyScenario } from '../../src/domain/economy/validate';
import type { MaterialRequirements } from '../../src/domain/materials/calculate';

// Designed from arithmetic contracts; no game definitions, observations, or user balances.
export const grant=(resourceId:string,quantity:number,destination:Grant['destination']='inventory'):Grant=>({resourceId,quantity,destination});
export const reward=(...fixed:Grant[]):Rewards=>({fixed,lotteries:[],unavailable:[]});
export function economyFixture(){
  const {m,c}=materialFixture();
  m.materialDefinition!.resources.push(...['tokens-a','tokens-b','voucher','festival','draw-right','practice'].map(id=>({id,name:'架空資源 '+id,unit:'item' as const})));
  const supply:SupplyDefinition={catalogRevision:m.revision,revision:'fictional-supply-3',basis:'独立した架空経済モデル',utcOffsetMinutes:0,
    currencies:['tokens-a','tokens-b','voucher','festival'],
    lives:[{id:'alto',name:'架空ライブ Alto',basis:'架空の基礎報酬',mode:'play',scoreRank:'Alto',lbMultiplier:3,
      perLb:reward(grant('paper',7),grant('member-exp',11),grant('snap-exp',13)),perPlay:reward(grant('member-exp',19,'direct'))},
    {id:'bass',name:'架空ライブ Bass',basis:'別の架空基礎報酬',mode:'play',scoreRank:'Bass',lbMultiplier:3,perLb:reward(grant('paper',17)),perPlay:reward()},
    {id:'skip',name:'架空スキップ',basis:'独立した架空スキップ設定',mode:'skip',scoreRank:'Skip',lbMultiplier:3,perLb:reward(grant('paper',2)),perPlay:reward()}],
    studios:[{bandId:8101,level:8,tickMinutes:12,rewardScale:{numerator:1,denominator:1},normalMinutes:120,capMinutes:240,overflowRate:{numerator:1,denominator:2},
      rounding:'claim',lotteryRounding:'fractional',rewards:{...reward(grant('paper',3)),lotteries:[{draws:{numerator:2,denominator:1},totalWeight:4,
        outcomes:[{weight:1,rewards:[grant('paper',2)]},{weight:3,rewards:[]}]}]},basis:'架空の時間報酬・抽選表'}],
    ranks:[{rank:6,studioMultiplier:{numerator:7,denominator:4},daily:reward(grant('paper',5))}],
    events:[{id:'festival-a',name:'架空の祭りA',basis:'架空イベントA',startsAt:'2024-01-01T00:00:00Z',endsAt:'2024-02-01T00:00:00Z',
      milestones:[{points:40,excludeOnFullCollection:false,rewards:reward(grant('festival',8),grant('paper',4))},
        {points:80,excludeOnFullCollection:false,rewards:reward(grant('festival',9))},
        {points:100,excludeOnFullCollection:true,rewards:reward(grant('festival',50))}],
      repeat:{startsAfter:100,everyPoints:40,rewards:reward(grant('festival',11))}}],
    offers:[{id:'catalog-paper',name:'架空の週次素材',basis:'架空の週次商品',scope:'catalog',minimumRank:6,
      costs:[{resourceId:'tokens-b',quantity:7}],rewards:reward(grant('paper',13)),limit:3,reset:{kind:'weekly',hour:0,weekday:1},window:null},
      {id:'seal-paper',name:'架空の無制限素材',basis:'架空の無制限交換',scope:'seal',minimumRank:null,costs:[{resourceId:'voucher',quantity:2}],rewards:reward(grant('paper',3)),limit:null,reset:{kind:'once',hour:0},window:null},
      {id:'event-limited',name:'架空イベント制限商品',basis:'架空イベント交換',scope:'event',eventId:'festival-a',minimumRank:null,costs:[{resourceId:'festival',quantity:5}],rewards:reward(grant('paper',7)),limit:3,reset:{kind:'once',hour:0},window:null},
      {id:'event-unlimited',name:'架空イベント無制限',basis:'架空イベント余剰交換',scope:'event',eventId:'festival-a',minimumRank:null,costs:[{resourceId:'festival',quantity:1}],rewards:reward(grant('paper',2)),limit:null,reset:{kind:'once',hour:0},window:null}],
    passes:[{id:'short-pass',name:'架空パス',basis:'架空の9日契約',durationDays:9,priceYen:73,purchase:reward(grant('tokens-a',17)),
      daily:reward(grant('tokens-b',3)),weekly:reward(grant('draw-right',2,'entitlement')),weeklyReset:{kind:'weekly',hour:0,weekday:1},eventDaily:reward(grant('draw-right',1,'entitlement')),features:['架空の操作補助']}],
    fixedSources:[],unavailable:[]};
  m.supplyDefinition=supply;
  c.resourceInventory=Object.fromEntries(m.materialDefinition!.resources.map(r=>[r.id,0]));
  const scenario=emptyEconomyScenario(m.catalogId,'2024-01-01');scenario.rank=6;
  const requirements:MaterialRequirements={cards:[],totals:[{resourceId:'paper',quantity:2000},{resourceId:'member-exp',quantity:999}],resources:m.materialDefinition!.resources,incomplete:false};
  return {m,c,supply,scenario,requirements};
}
