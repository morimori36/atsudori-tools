import { materialFixture } from './materials';
import type { Grant, Rewards, SupplyDefinition } from '../../src/domain/economy/model';
import { defaultSupplyConditions } from '../../src/domain/economy/model';
import type { MaterialRequirements } from '../../src/domain/materials/calculate';

// Designed from arithmetic contracts; no game definitions, observations, or user balances.
export const grant=(resourceId:string,quantity:number,destination:Grant['destination']='inventory'):Grant=>({resourceId,quantity,destination});
export const reward=(...fixed:Grant[]):Rewards=>({fixed,lotteries:[],unavailable:[]});
export function economyFixture(){
  const {m,c}=materialFixture();
  m.materialDefinition!.resources.push(...['tokens-a','tokens-b'].map(id=>({id,name:'架空資源 '+id,unit:'item' as const})));
  const supply:SupplyDefinition={schemaVersion:5,catalogRevision:m.revision,revision:'fictional-supply-5',basis:'独立した架空経済モデル',
    currencies:['tokens-a','tokens-b'],
    lives:[{id:'alto',name:'架空ライブ Alto',basis:'架空の基礎報酬',mode:'play',scoreRank:'Alto',lbMultiplier:3,
      perLb:reward(grant('paper',7),grant('member-exp',11),grant('snap-exp',13)),perPlay:reward(grant('member-exp',19,'direct'))},
    {id:'bass',name:'架空ライブ Bass',basis:'別の架空基礎報酬',mode:'play',scoreRank:'Bass',lbMultiplier:3,perLb:reward(grant('paper',17)),perPlay:reward()},
    {id:'skip',name:'架空スキップ',basis:'独立した架空スキップ設定',mode:'skip',scoreRank:'Skip',lbMultiplier:3,perLb:reward(grant('paper',2)),perPlay:reward()}],
    studios:[{bandId:8101,level:8,tickMinutes:12,rewardScale:{numerator:1,denominator:1},normalMinutes:120,rewards:{...reward(grant('paper',3)),lotteries:[{draws:{numerator:2,denominator:1},totalWeight:4,
        outcomes:[{weight:1,rewards:[grant('paper',2)]},{weight:3,rewards:[]}]}]},basis:'架空の時間報酬・抽選表'}],
    ranks:[{rank:6,studioMultiplier:{numerator:7,denominator:4},daily:reward()}],
    standardEvent:{intervalDays:10,basis:'架空の暫定開催頻度',cumulative:reward(grant('paper',20)),limited:reward(grant('paper',10))},
    fixedSources:['event-pass-free','event-pass-premium','season-pass-free','season-pass-premium'].map(id=>({id,name:id,basis:'独立した架空の継続報酬',intervalDays:{numerator:30,denominator:1},rewards:reward()})),unavailable:[]};
  m.supplyDefinition=supply;
  c.resourceInventory=Object.fromEntries(m.materialDefinition!.resources.map(r=>[r.id,0]));
  c.tgwRank=6;c.supplyConditions=defaultSupplyConditions();
  const requirements:MaterialRequirements={cards:[],totals:[{resourceId:'paper',quantity:2000},{resourceId:'member-exp',quantity:999}],resources:m.materialDefinition!.resources,incomplete:false};
  return {m,c,supply,requirements};
}
