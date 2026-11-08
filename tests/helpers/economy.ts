import { materialFixture } from './materials';
import type { Grant, Rewards, SupplyDefinition } from '../../src/domain/economy/model';
import { emptyEconomyScenario } from '../../src/domain/economy/validate';
import type { MaterialRequirements } from '../../src/domain/materials/calculate';

// Designed from arithmetic contracts; no game definitions, observations, or user balances.
export const grant=(resourceId:string,quantity:number,destination:Grant['destination']='inventory'):Grant=>({resourceId,quantity,destination});
export const reward=(...fixed:Grant[]):Rewards=>({fixed,lotteries:[],unavailable:[]});
export function economyFixture(){
  const {m,c}=materialFixture();
  m.materialDefinition!.resources.push(...['tokens-a','tokens-b','draw-right'].map(id=>({id,name:'架空資源 '+id,unit:'item' as const})));
  const supply:SupplyDefinition={schemaVersion:2,catalogRevision:m.revision,revision:'fictional-supply-3',basis:'独立した架空経済モデル',utcOffsetMinutes:0,
    currencies:['tokens-a','tokens-b'],
    lives:[{id:'alto',name:'架空ライブ Alto',basis:'架空の基礎報酬',mode:'play',scoreRank:'Alto',lbMultiplier:3,
      perLb:reward(grant('paper',7),grant('member-exp',11),grant('snap-exp',13)),perPlay:reward(grant('member-exp',19,'direct'))},
    {id:'bass',name:'架空ライブ Bass',basis:'別の架空基礎報酬',mode:'play',scoreRank:'Bass',lbMultiplier:3,perLb:reward(grant('paper',17)),perPlay:reward()},
    {id:'skip',name:'架空スキップ',basis:'独立した架空スキップ設定',mode:'skip',scoreRank:'Skip',lbMultiplier:3,perLb:reward(grant('paper',2)),perPlay:reward()}],
    studios:[{bandId:8101,level:8,tickMinutes:12,rewardScale:{numerator:1,denominator:1},normalMinutes:120,capMinutes:240,overflowRate:{numerator:1,denominator:2},
      rounding:'claim',lotteryRounding:'fractional',rewards:{...reward(grant('paper',3)),lotteries:[{draws:{numerator:2,denominator:1},totalWeight:4,
        outcomes:[{weight:1,rewards:[grant('paper',2)]},{weight:3,rewards:[]}]}]},basis:'架空の時間報酬・抽選表'}],
    ranks:[{rank:6,studioMultiplier:{numerator:7,denominator:4},daily:reward(grant('paper',5))}],
    standardEvent:{intervalDays:10,activeDays:7,basis:'架空の暫定開催頻度',cumulative:reward(grant('paper',20)),limited:reward(grant('paper',10))},
    passes:[{id:'short-pass',name:'架空パス',basis:'架空の9日契約',durationDays:9,priceYen:73,purchase:reward(grant('tokens-a',17)),
      daily:reward(grant('tokens-b',3)),weekly:reward(grant('draw-right',2,'entitlement')),weeklyReset:{kind:'weekly',hour:0,weekday:1},eventDaily:reward(grant('draw-right',1,'entitlement')),features:['架空の操作補助']}],
    fixedSources:[],unavailable:[]};
  m.supplyDefinition=supply;
  c.resourceInventory=Object.fromEntries(m.materialDefinition!.resources.map(r=>[r.id,0]));
  const scenario=emptyEconomyScenario(m.catalogId,'2024-01-01');scenario.rank=6;
  const requirements:MaterialRequirements={cards:[],totals:[{resourceId:'paper',quantity:2000},{resourceId:'member-exp',quantity:999}],resources:m.materialDefinition!.resources,incomplete:false};
  return {m,c,supply,scenario,requirements};
}
