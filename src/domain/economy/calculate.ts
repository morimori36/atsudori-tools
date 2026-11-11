import { EVENT_INTERVAL_DAYS } from '../supply-assumptions';
import type { Collection } from '../../storage/collection';
import { defaultSupplyConditions } from './model';
import { hasTrackingScope, trackedInventory, trackedResources } from '../materials/tracking';
import type { Masterdata } from '../../data/catalog/model';
import type { MaterialRequirements } from '../materials/calculate';
import { materialInventoryBalances, validateResourceInventory } from '../materials/inventory';
import type { Certainty, DailySupplyEntry, EconomyIssue, Named, Ratio, Rewards } from './model';
import { validateSupplyConditions, validateSupplyDefinition, supplyIssues } from './validate';

type Fraction = { n:bigint; d:bigint };
const one:Fraction={n:1n,d:1n},zero:Fraction={n:0n,d:1n};
function ratio(n:bigint,d:bigint):Fraction {
  let a=n,b=d;while(b){const r=a%b;a=b;b=r;}
  return {n:n/(a||1n),d:d/(a||1n)};
}
const fraction=(value:Ratio):Fraction=>ratio(BigInt(value.numerator),BigInt(value.denominator));
const times=(a:Fraction,b:Fraction):Fraction=>ratio(a.n*b.n,a.d*b.d);
const plus=(a:Fraction,b:Fraction):Fraction=>ratio(a.n*b.d+b.n*a.d,a.d*b.d);
const units=(n:number):Fraction=>({n:BigInt(n),d:1n});
function safe(n:number):number {if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)throw new Error('日平均供給・充足日数が対応する数値範囲を超えます');return n;}
function integer(n:bigint):number {const result=Number(n);if(!Number.isSafeInteger(result))throw new Error('日平均供給・充足日数が安全な整数の範囲を超えます');return result;}
const floor=(a:Fraction):number=>integer(a.n/a.d);
const decimal=(a:Fraction):number=>safe(Number(a.n)/Number(a.d));
const inventoryIds=(r:Rewards):string[]=>[...new Set([...r.fixed,...r.lotteries.flatMap(l=>l.outcomes.flatMap(o=>o.rewards))].filter(g=>g.destination==='inventory').map(g=>g.resourceId))];
const hasRewards=(r:Rewards)=>r.fixed.length+r.lotteries.length+r.unavailable.length>0;

/** Steady daily rates only. No calendar, horizon, future stock or end-of-period collections. */
export function calculateEconomy(master:Masterdata,collection:Collection,requirements:MaterialRequirements) {
  let inventory=validateResourceInventory(collection.resourceInventory??{});
  const conditions=validateSupplyConditions(collection.supplyConditions??defaultSupplyConditions());
  if(collection.catalogId!==master.catalogId)throw new Error('試算条件のcatalogIdが一致しません');
  const definition=hasTrackingScope(master.materialDefinition)&&master.supplyDefinition?validateSupplyDefinition(master.supplyDefinition):undefined;
  const referenceIssues=supplyIssues(master);if(referenceIssues.length)throw new Error(referenceIssues.join('\n'));
  const resources=trackedResources(master.materialDefinition);
  inventory=hasTrackingScope(master.materialDefinition)?trackedInventory(inventory,master.materialDefinition):{};
  const resourceSet=new Set(resources.map(r=>r.id));
  const breakdown:DailySupplyEntry[]=[],issues:EconomyIssue[]=[];
  const totals=new Map<string,Fraction>();
  const byResource=new Map<string,DailySupplyEntry[]>();
  const issueKeys=new Set<string>();
  function issue(sourceId:string,reason:string,resourceIds:string[]=[],blocksProjection=true):void {
    const key=JSON.stringify([sourceId,reason,resourceIds,blocksProjection]);if(issueKeys.has(key))return;issueKeys.add(key);
    if(issues.length>=2000)throw new Error('未確認項目が上限を超えます。試算条件を絞ってください');
    issues.push({sourceId,reason,resourceIds,blocksProjection});
  }
  function entry(source:Named,resourceId:string,quantity:Fraction,destination:DailySupplyEntry['destination'],certainty:Certainty):void {
    if(!resourceSet.has(resourceId))throw new Error('試算対象の素材IDがマスタにありません');
    if(!quantity.n)return;
    if(breakdown.length>=200000)throw new Error('供給内訳が上限を超えます。試算条件を絞ってください');
    const item={sourceId:source.id,sourceName:source.name,basis:source.basis,resourceId,dailyQuantity:decimal(quantity),destination,certainty};
    breakdown.push(item);
    if(destination==='inventory'){
      totals.set(resourceId,plus(totals.get(resourceId)??zero,quantity));
      if(!byResource.has(resourceId))byResource.set(resourceId,[]);
      byResource.get(resourceId)!.push(item);
    }
  }
  // Round each collection before converting its repeated cadence into a daily average.
  function rewards(source:Named,r:Rewards,rate=one,factor=one,lotteryRounding:'floor'|'fractional'='fractional'):void {
    if(!rate.n||!factor.n)return;
    for(const u of r.unavailable)issue(source.id,u.reason,u.resourceIds,!u.destination||u.destination==='inventory');
    for(const g of r.fixed)entry(source,g.resourceId,times(units(floor(times(units(g.quantity),factor))),rate),g.destination,'confirmed');
    for(const l of r.lotteries){
      const rawDraws=times(fraction(l.draws),factor);
      const draws=lotteryRounding==='floor'?units(floor(rawDraws)):rawDraws;
      for(const o of l.outcomes)for(const g of o.rewards)
        entry(source,g.resourceId,times(times(times(draws,ratio(BigInt(o.weight),BigInt(l.totalWeight))),units(g.quantity)),rate),g.destination,'expected');
    }
  }
  function missingRewards(source:Named,r:Rewards,reason:string):void {
    if(!hasRewards(r))return;
    const unknown=r.unavailable.filter(u=>!u.destination||u.destination==='inventory');
    // An unscoped inventory unknown affects all resources, even when known grants have IDs.
    const unscoped=unknown.some(u=>u.resourceIds.length===0);
    const ids=unscoped?[]:[...new Set([...inventoryIds(r),...unknown.flatMap(u=>u.resourceIds)])];
    issue(source.id,reason,ids,ids.length>0||unknown.length>0);
  }
  if(!definition)issue('supply','供給定義が未登録です。日平均供給を計算できません');
  if(definition){
    for(const u of definition.unavailable)issue('supply',u.reason,u.resourceIds,!u.destination||u.destination==='inventory');
    const rank=definition.ranks.find(r=>r.rank===collection.tgwRank);
    if(conditions.lbPerDay>0){
      const candidates=definition.lives.filter(r=>r.mode==='play'&&r.scoreRank===conditions.scoreRank);
      if(candidates.length!==1)issue('live','ライブのスコアランクに対応する通常ライブ報酬が未登録・重複しています');
      else {
        const r=candidates[0]!;
        rewards(r,r.perLb,units(conditions.lbPerDay),units(r.lbMultiplier));
        if(inventoryIds(r.perPlay).length||r.perPlay.unavailable.some(u=>!u.destination||u.destination==='inventory'))
          missingRewards(r,r.perPlay,'ライブ回数に依存する素材報酬はLB消費量だけでは計算できません');
      }
    }
    for(const selected of conditions.studioLevels){
      const row=definition.studios.find(s=>s.bandId===selected.bandId&&s.level===selected.level);
      const source={id:'studio:'+selected.bandId,name:master.bands.find(b=>b.id===selected.bandId)?.name??'練習',basis:row?.basis??definition.basis};
      if(!row){issue(source.id,'指定した練習Lvの報酬定義がありません');continue;}
      if(!rank?.studioMultiplier){missingRewards(source,row.rewards,'ランクによる練習報酬倍率が未確認です');continue;}
      if(row.rounding===null||row.lotteryRounding===null){missingRewards(source,row.rewards,'練習報酬の端数処理が未確認です');continue;}
      const multiplier=times(fraction(rank.studioMultiplier),fraction(row.rewardScale));
      // A daily rate has no receipt cycle, waiting period, overflow or cap state.
      // Claim rounding is usable only if each tick is already integral; otherwise
      // receipts would change the result and no supported daily conversion is known.
      const integral=(value:Fraction)=>value.n%value.d===0n;
      const needsClaim=row.rounding==='claim'&&row.rewards.fixed.some(g=>!integral(times(units(g.quantity),multiplier)));
      const needsLotteryClaim=row.rounding==='claim'&&row.lotteryRounding==='floor'&&row.rewards.lotteries.some(l=>!integral(times(fraction(l.draws),multiplier)));
      if(needsClaim||needsLotteryClaim){missingRewards(source,row.rewards,'練習報酬の受取単位の丸めを日平均へ換算する方法が未確認です');continue;}
      rewards(source,row.rewards,ratio(1440n,BigInt(row.tickMinutes)),multiplier,row.lotteryRounding);
    }
    {
      const source={id:'daily',name:'ランクのデイリー報酬',basis:definition.basis};
      if(!rank?.daily)issue(source.id,'指定ランクのデイリー報酬が未確認です');
      else rewards(source,rank.daily);
    }
    {
      const e=definition.standardEvent;
      if(!e)issue('standard-event','標準イベント報酬・開催間隔が未登録です');
      else for(const [id,name,r] of [['cumulative','累計',e.cumulative],['limited','制限商品分',e.limited]] as const){
        const source={id:'standard-event:'+id,name:'標準イベント'+name,basis:e.basis};
        const rate=ratio(1n,BigInt(EVENT_INTERVAL_DAYS));
        for(const u of r.unavailable)issue(source.id,u.reason,u.resourceIds,!u.destination||u.destination==='inventory');
        for(const g of r.fixed)entry(source,g.resourceId,times(units(g.quantity),rate),g.destination,'estimated');
        for(const l of r.lotteries)for(const o of l.outcomes)for(const g of o.rewards)
          entry(source,g.resourceId,times(times(times(fraction(l.draws),ratio(BigInt(o.weight),BigInt(l.totalWeight))),units(g.quantity)),rate),g.destination,'estimated');
      }
    }
    const purchases=collection.starBudgetScenario;
    for(const [id,included] of [
      ['event-pass-free',true],['event-pass-premium',purchases?.eventPremium??false],
      ['season-pass-free',true],['season-pass-premium',purchases?.seasonPremium??false]
    ] as const){
      if(!included)continue;
      const source=definition.fixedSources.find(f=>f.id===id);
      if(!source){issue(id,'継続報酬の定義がありません');continue;}
      if(id.startsWith('season-pass-')&&!source.intervalDays){missingRewards(source,source.rewards,'継続報酬の換算日数が未確認です');continue;}
      const rate=id.startsWith('event-pass-')?ratio(1n,BigInt(EVENT_INTERVAL_DAYS)):ratio(BigInt(source.intervalDays!.denominator),BigInt(source.intervalDays!.numerator));
      rewards(source,source.rewards,rate);
    }
  }

  const balances=materialInventoryBalances({...requirements,resources},inventory);
  const original=new Map(balances.balances.map(r=>[r.resource.id,r]));
  const rows=resources.map(resource=>{
    const entries=byResource.get(resource.id)??[];
    const sum=(certainty:Certainty)=>safe(entries.filter(e=>e.certainty===certainty).reduce((n,e)=>n+e.dailyQuantity,0));
    const stock=Object.hasOwn(inventory,resource.id)?inventory[resource.id]!:null;
    const requiredSubtotal=original.get(resource.id)?.required??0;
    const required=requirements.incomplete?null:requiredSubtotal;
    const shortage=stock===null||required===null?null:Math.max(0,required-stock);
    const supplyIncomplete=issues.some(i=>i.blocksProjection&&(!i.resourceIds.length||i.resourceIds.includes(resource.id)));
    const total=totals.get(resource.id)??zero;
    const knownDailySupply=decimal(total),dailySupply=supplyIncomplete?null:knownDailySupply;
    const status=shortage===null?'unknown':shortage===0?'fulfilled':dailySupply===null?'unknown':total.n===0n?'unreachable':'estimated';
    const clearanceDays=status==='fulfilled'?0:status==='estimated'?integer((BigInt(shortage!)*total.d+total.n-1n)/total.n):null;
    return {resource,required,requiredSubtotal,stock,shortage,dailySupply,knownDailySupply,clearanceDays,status,
      confirmedDaily:sum('confirmed'),expectedDaily:sum('expected'),eventDaily:sum('estimated'),
      supplyIncomplete,sources:[...new Set(entries.map(e=>e.sourceName))]};
  });
  return {
    rows,breakdown,issues,requirementsIncomplete:requirements.incomplete,unsupportedInventory:balances.unsupported};
}
export type EconomyResult=ReturnType<typeof calculateEconomy>;
