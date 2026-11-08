import type { Masterdata } from '../../data/catalog/model';
import type { MaterialRequirements } from '../materials/calculate';
import { materialInventoryBalances, validateResourceInventory } from '../materials/inventory';
import type { ResourceInventory } from '../materials/inventory';
import type { Certainty, EconomyIssue, EconomyScenario, LedgerEntry, Named, Ratio, Rewards } from './model';
import { validateEconomyScenario, validateSupplyDefinition, supplyIssues } from './validate';
import { DAY, localDate, opportunities, period } from './time';

type Fraction = { n:bigint; d:bigint };
const one:Fraction={n:1n,d:1n};
const fraction=(value:Ratio):Fraction=>({n:BigInt(value.numerator),d:BigInt(value.denominator)});
const times=(a:Fraction,b:Fraction):Fraction=>({n:a.n*b.n,d:a.d*b.d});
const plus=(a:Fraction,b:Fraction):Fraction=>({n:a.n*b.d+b.n*a.d,d:a.d*b.d});
const units=(n:number):Fraction=>({n:BigInt(n),d:1n});
function safe(n:number):number {if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)throw new Error('素材・通貨収支が対応する数値範囲を超えます');return n;}
function integer(n:bigint):number {const result=Number(n);if(!Number.isSafeInteger(result))throw new Error('素材・通貨収支が安全な整数の範囲を超えます');return result;}
const floor=(a:Fraction):number=>integer(a.n/a.d);
const decimal=(a:Fraction):number=>safe(Number(a.n)/Number(a.d));
const inventoryIds=(r:Rewards):string[]=>[...new Set([...r.fixed,...r.lotteries.flatMap(l=>l.outcomes.flatMap(o=>o.rewards))].filter(g=>g.destination==='inventory').map(g=>g.resourceId))];
const hasRewards=(r:Rewards)=>r.fixed.length+r.lotteries.length+r.unavailable.length>0;
const iso=(at:number)=>new Date(at).toISOString();

/** Pure accounting. Estimates stay separate from fixed inventory. Unknown starting stock stays unknown. */
export function calculateEconomy(master:Masterdata,inventory:ResourceInventory,requirements:MaterialRequirements,input:EconomyScenario) {
  validateResourceInventory(inventory);
  const scenario=validateEconomyScenario(input);
  if(scenario.catalogId!==master.catalogId)throw new Error('試算条件のcatalogIdが一致しません');
  const definition=master.supplyDefinition?validateSupplyDefinition(master.supplyDefinition):undefined;
  const referenceIssues=supplyIssues(master);if(referenceIssues.length)throw new Error(referenceIssues.join('\n'));
  const offset=definition?.utcOffsetMinutes??0;
  const {start,end,days}=period(scenario.startDate,scenario.endDate,offset);
  const resources=master.materialDefinition?.resources??[];
  const resourceSet=new Set(resources.map(r=>r.id));
  const ledger:LedgerEntry[]=[],issues:EconomyIssue[]=[];
  const issueKeys=new Set<string>();
  function issue(sourceId:string,reason:string,resourceIds:string[]=[],blocksProjection=true):void {
    const key=JSON.stringify([sourceId,reason,resourceIds,blocksProjection]);if(issueKeys.has(key))return;issueKeys.add(key);
    if(issues.length>=2000)throw new Error('未確認・未実行項目が上限を超えます。試算条件を絞ってください');
    issues.push({sourceId,reason,resourceIds,blocksProjection});
  }
  const stocks=new Map(resources.map(r=>[r.id,{confirmed:inventory[r.id]??0,conditional:0,known:Object.hasOwn(inventory,r.id)}]));
  type Job={at:number;priority:number;order:number;run:()=>void};
  const jobs:Job[]=[];
  function job(at:number,priority:number,run:()=>void):void {
    if(at<start||at>=end)return;
    if(jobs.length>=100000)throw new Error('試算の処理件数が上限を超えます。期間や対象を絞ってください');
    jobs.push({at,priority,order:jobs.length,run});
  }
  function entry(at:number,source:Named,resourceId:string,quantity:number,destination:LedgerEntry['destination'],certainty:Certainty,conditional=certainty==='conditional'):void {
    if(!resourceSet.has(resourceId))throw new Error('試算対象の素材IDがマスタにありません');
    if(!quantity)return;
    safe(quantity);
    if(ledger.length>=200000)throw new Error('試算明細が上限を超えます。期間や対象を絞ってください');
    ledger.push({at:iso(at),sourceId:source.id,sourceName:source.name,basis:source.basis,resourceId,quantity,destination,certainty,conditional});
    if(destination==='inventory'&&quantity>0&&certainty!=='expected'&&certainty!=='estimated'){
      const f=stocks.get(resourceId)!;const field=certainty==='confirmed'?'confirmed':'conditional';safe(f.confirmed+f.conditional+quantity);f[field]=safe(f[field]+quantity);
    }
  }
  function rewards(at:number,source:Named,r:Rewards,factor=one,count=1,certainty:'confirmed'|'conditional'='confirmed',lotteryRounding:'floor'|'fractional'='fractional'):void {
    if(!count||factor.n===0n)return;
    for(const unknown of r.unavailable)issue(source.id,unknown.reason,unknown.resourceIds,!unknown.destination||unknown.destination==='inventory');
    for(const grant of r.fixed){
      const q=integer(BigInt(floor(times(units(grant.quantity),factor)))*BigInt(count));
      entry(at,source,grant.resourceId,q,grant.destination,certainty);
    }
    for(const lottery of r.lotteries){
      const n=times(fraction(lottery.draws),factor);
      const draws=lotteryRounding==='floor'?floor(n):decimal(n);
      const expected=new Map<string,{resourceId:string;destination:LedgerEntry['destination'];quantity:number}>();
      for(const outcome of lottery.outcomes)for(const grant of outcome.rewards){
        const key=grant.destination+':'+grant.resourceId;
        const q=safe(draws*count*(outcome.weight/lottery.totalWeight)*grant.quantity);
        const previous=expected.get(key)?.quantity??0;
        expected.set(key,{...grant,quantity:safe(previous+q)});
      }
      for(const grant of expected.values())entry(at,source,grant.resourceId,grant.quantity,grant.destination,'expected',certainty==='conditional');
    }
  }
  function missingRewards(source:Named,r:Rewards,reason:string):void {
    const unknown=r.unavailable.filter(u=>!u.destination||u.destination==='inventory');
    const ids=[...new Set([...inventoryIds(r),...unknown.flatMap(u=>u.resourceIds)])];
    issue(source.id,reason,ids,ids.length>0||unknown.length>0);
  }
  if(!definition)issue('supply','供給定義が未登録です。供給を計算できません');
  if(definition){
    for(const u of definition.unavailable)issue('supply',u.reason,u.resourceIds,!u.destination||u.destination==='inventory');
    const rank=definition.ranks.find(r=>r.rank===scenario.rank);
    if(scenario.live.enabled){
      const total=integer(BigInt(scenario.live.lbPerDay)*BigInt(days));
      const skip=floor(times(units(total),{n:BigInt(scenario.live.skipPercent),d:100n}));
      for(const [mode,id,lb,count] of [['play',scenario.live.playId,total-skip,scenario.live.playsPerDay],['skip',scenario.live.skipId,skip,scenario.live.skipsPerDay]] as const){
        if(!lb&&count===0)continue;
        const r=definition.lives.find(r=>r.id===id&&r.mode===mode);
        if(!r){if(lb||count)issue('live:'+mode,'対象のライブ報酬定義がありません');continue;}
        // Allocate whole LB over the period; daily totals need not divide the selected percentage.
        const daily=Math.floor(lb/days),remainder=lb%days;
        for(let day=0;day<days;day++){
          const at=start+day*DAY+DAY-1;
          const dayLb=daily+(day<remainder?1:0);
          if(dayLb)job(at,10,()=>rewards(at,r,r.perLb,units(r.lbMultiplier),dayLb));
          if(count!==null&&count>0)job(at,10,()=>rewards(at,r,r.perPlay,one,count));
        }
        if(count===null&&hasRewards(r.perPlay))missingRewards(r,r.perPlay,'ライブ回数が未設定のため、回数ごとの報酬は未確認です');
      }
    }
    if(scenario.studio.enabled&&!scenario.studio.levels.length)issue('studio','試算するバンドの練習Lvが未設定です');
    if(scenario.studio.enabled)for(const selected of scenario.studio.levels){
      const row=definition.studios.find(s=>s.bandId===selected.bandId&&s.level===selected.level);
      const source={id:'studio:'+selected.bandId,name:master.bands.find(b=>b.id===selected.bandId)?.name??'練習',basis:row?.basis??definition.basis};
      if(!row){issue(source.id,'指定した練習Lvの報酬定義がありません');continue;}
      if(!rank?.studioMultiplier){missingRewards(source,row.rewards,'ランクによる練習報酬倍率が未確認です');continue;}
      if(row.rounding===null||row.lotteryRounding===null){missingRewards(source,row.rewards,'練習報酬の端数処理が未確認です');continue;}
      const multiplier=times(fraction(rank.studioMultiplier),fraction(row.rewardScale));
      const totalMinutes=scenario.studio.minutesPerDay*days;
      const interval=scenario.studio.claimEveryMinutes;
      // minutesPerDay is the selected accumulation time; pauses contribute neither ticks nor rewards.
      for(let accumulated=0;accumulated<totalMinutes;){
        const minutes=Math.min(interval,totalMinutes-accumulated);accumulated+=minutes;
        const at=Math.min(end-1,start+Math.ceil(accumulated/Math.max(scenario.studio.minutesPerDay,1)*DAY)-1);
        const kept=Math.min(minutes,row.capMinutes??minutes);
        const ticks=Math.floor(kept/row.tickMinutes);
        const normalTicks=Math.min(ticks,row.normalMinutes/row.tickMinutes),overflowTicks=ticks-normalTicks;
        if(overflowTicks&&!row.overflowRate)missingRewards(source,row.rewards,'通常効率を超える蓄積時間の計算が未確認です');
        const overflow=fraction(row.overflowRate??{numerator:0,denominator:1});
        if(row.rounding==='claim'){
          const factor=times(multiplier,plus(units(normalTicks),times(units(overflowTicks),overflow)));
          job(at,10,()=>rewards(at,source,row.rewards,factor,1,'confirmed',row.lotteryRounding!));
        }else{
          if(normalTicks)job(at,10,()=>rewards(at,source,row.rewards,multiplier,normalTicks,'confirmed',row.lotteryRounding!));
          if(overflowTicks&&row.overflowRate)job(at,10,()=>rewards(at,source,row.rewards,times(multiplier,overflow),overflowTicks,'confirmed',row.lotteryRounding!));
        }
      }
      if(!totalMinutes)issue(source.id,'蓄積時間は0分です',[],false);
    }
    if(scenario.dailyClaims){
      const source={id:'daily',name:'ランクのデイリー報酬',basis:definition.basis};
      if(!rank?.daily)issue(source.id,'指定ランクのデイリー報酬が未確認です');
      else for(let day=0;day<scenario.dailyClaims;day++){const at=start+day*DAY;job(at,10,()=>rewards(at,source,rank.daily!));}
    }
    function estimate(source:Named,r:Rewards,numerator:number,denominator=1):void {
      for(const u of r.unavailable)issue(source.id,u.reason,u.resourceIds,!u.destination||u.destination==='inventory');
      for(const g of r.fixed)entry(end-1,source,g.resourceId,decimal(times(units(g.quantity),{n:BigInt(numerator),d:BigInt(denominator)})),g.destination,'estimated',true);
      for(const l of r.lotteries)for(const o of l.outcomes)for(const g of o.rewards)
        entry(end-1,source,g.resourceId,safe(numerator/denominator*l.draws.numerator/l.draws.denominator*o.weight/l.totalWeight*g.quantity),g.destination,'estimated',true);
    }
    if(scenario.includeEvents){
      const e=definition.standardEvent;
      if(!e)issue('standard-event','標準イベント報酬・開催間隔が未登録です');
      else {
        estimate({id:'standard-event:cumulative',name:'標準イベント累計',basis:e.basis},e.cumulative,days,e.intervalDays);
        estimate({id:'standard-event:limited',name:'標準イベント制限商品分',basis:e.basis},e.limited,days,e.intervalDays);
      }
    }
    for(const selected of scenario.fixedSources){
      const source=definition.fixedSources.find(f=>f.id===selected.sourceId);
      if(!source){issue(selected.sourceId,'固定報酬の定義がありません');continue;}
      const a=Math.max(start,source.window?Date.parse(source.window.startsAt):start),b=Math.min(end,source.window?Date.parse(source.window.endsAt):end);
      const dates=opportunities(a,b,source.reset,offset);
      if(selected.claims>dates.length)throw new Error('固定報酬の受取回数が期間内の機会を超えます');
      for(const at of dates.slice(0,selected.claims))job(at,10,()=>{rewards(at,source,source.rewards,one,1,'conditional');});
    }
  }
  jobs.sort((a,b)=>a.at-b.at||a.priority-b.priority||a.order-b.order).forEach(j=>j.run());
  const initial=materialInventoryBalances(requirements,inventory);
  const finalInventory=Object.fromEntries([...stocks].filter(([,f])=>f.known).map(([id,f])=>[id,safe(f.confirmed+f.conditional)]));
  const afterFixed=materialInventoryBalances(requirements,finalInventory);
  const original=new Map(initial.balances.map(r=>[r.resource.id,r]));
  const final=new Map(afterFixed.balances.map(r=>[r.resource.id,r]));
  const byResource=new Map<string,LedgerEntry[]>();
  for(const e of ledger)if(e.destination==='inventory'){
    if(!byResource.has(e.resourceId))byResource.set(e.resourceId,[]);byResource.get(e.resourceId)!.push(e);
  }
  const rows=resources.map(resource=>{
    const entries=byResource.get(resource.id)??[];
    const sum=(filter:(e:LedgerEntry)=>boolean)=>entries.filter(filter).reduce((n,e)=>safe(n+e.quantity),0);
    const stock=Object.hasOwn(inventory,resource.id)?inventory[resource.id]!:null;
    const fixedStock=stock===null?null:finalInventory[resource.id]!;
    const expectedIncome=sum(e=>e.certainty==='expected');
    const eventIncome=sum(e=>e.certainty==='estimated'&&e.sourceId.startsWith('standard-event:'));
    const estimatedIncome=sum(e=>e.certainty==='estimated');
    const supplyIncomplete=issues.some(i=>i.blocksProjection&&(!i.resourceIds.length||i.resourceIds.includes(resource.id)));
    const estimatedStock=fixedStock===null||supplyIncomplete?null:safe(fixedStock+expectedIncome+estimatedIncome);
    const required=original.get(resource.id)?.required??0;
    return {resource,currency:definition?.currencies.includes(resource.id)??false,required,stock,
      currentShortage:original.get(resource.id)?.shortage??null,
      confirmedIncome:sum(e=>e.quantity>0&&e.certainty==='confirmed'),conditionalIncome:sum(e=>e.quantity>0&&e.certainty==='conditional'),expectedIncome,
      eventIncome,estimatedIncome,eventUnknown:scenario.includeEvents&&(!definition?.standardEvent||issues.some(i=>i.sourceId.startsWith('standard-event:')&&(!i.resourceIds.length||i.resourceIds.includes(resource.id)))),
      clearanceDays:stock===null||supplyIncomplete||requirements.incomplete?null:required<=stock?0:(sum(()=>true)>0?Math.ceil((required-stock)/(sum(()=>true)/days)):null),
      fixedStock,estimatedStock,shortageAfterFixed:final.get(resource.id)?.shortage??null,
      estimatedShortage:estimatedStock===null||requirements.incomplete?null:Math.max(0,required-estimatedStock),
      supplyIncomplete,demandIncomplete:requirements.incomplete,sources:[...new Set(entries.map(e=>e.sourceName))]};
  });
  return {format:'atsudori-tools/economy-result' as const,schemaVersion:3 as const,
    catalog:{catalogId:master.catalogId,revision:master.revision,supplyRevision:definition?.revision??null},
    scenario,period:{startsAt:iso(start),endsAt:iso(end),days,utcOffsetMinutes:definition?.utcOffsetMinutes??null},
    eventForecast:scenario.includeEvents&&definition?.standardEvent?{equivalentEvents:days/definition.standardEvent.intervalDays,intervalDays:definition.standardEvent.intervalDays}:null,
    assumptions:['開始日・終了日を含む期間です。','イベント供給は日数÷開催間隔。小数回を切り捨てず、全回収の標準報酬を比例配分します。','充足期間は今回の平均日次供給を維持する場合の概算です。平均供給による目安であり、正確な達成日を保証しません。','ライブ・練習・ランクは固定。期待と推計は確定在庫ではありません。'],
    rows,ledger,issues,requirementsIncomplete:requirements.incomplete,
    unsupportedInventory:initial.unsupported,
    entitlements:ledger.filter(e=>e.destination==='entitlement'),directRewards:ledger.filter(e=>e.destination==='direct'),
    dates:[...new Set(ledger.map(e=>localDate(Date.parse(e.at),offset)))]};
}
export type EconomyResult=ReturnType<typeof calculateEconomy>;
