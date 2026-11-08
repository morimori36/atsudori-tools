import type { Masterdata } from '../../data/catalog/model';
import type { MaterialRequirements } from '../materials/calculate';
import { materialInventoryBalances, validateResourceInventory } from '../materials/inventory';
import type { ResourceInventory } from '../materials/inventory';
import type { Certainty, EconomyIssue, EconomyScenario, LedgerEntry, Named, Offer, Ratio, Rewards } from './model';
import { validateEconomyScenario, validateSupplyDefinition, supplyIssues } from './validate';
import { DAY, localDate, opportunities, period, startOfDate } from './time';

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

/** Pure accounting. Expected rewards never enter spendable balances. Unknown starting stock stays unknown. */
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
  const funds=new Map(resources.map(r=>[r.id,{confirmed:inventory[r.id]??0,conditional:0,known:Object.hasOwn(inventory,r.id)}]));
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
    if(destination==='inventory'&&quantity>0&&certainty!=='expected'){
      const f=funds.get(resourceId)!;const field=certainty==='confirmed'?'confirmed':'conditional';safe(f.confirmed+f.conditional+quantity);f[field]=safe(f[field]+quantity);
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
  let cashCostYen=0;
  const pay=(n:number)=>{cashCostYen=integer(BigInt(cashCostYen)+BigInt(n));};
  function spend(at:number,source:Named,costs:{resourceId:string;quantity:number}[],reserve=false,conditional=false):boolean {
    for(const cost of costs){
      const f=funds.get(cost.resourceId);
      if(!f)throw new Error('支出に未登録の素材IDがあります');
      if(!f.known){issue(source.id,'現在庫が未登録のため支出を保留しました',[cost.resourceId],false);return false;}
      if(f.confirmed+f.conditional<cost.quantity){issue(source.id,'通貨・素材の残高不足のため支出を実行できませんでした',[cost.resourceId],false);return false;}
    }
    conditional ||= costs.some(c=>funds.get(c.resourceId)!.confirmed<c.quantity);
    for(const cost of costs){
      const f=funds.get(cost.resourceId)!;const confirmed=Math.min(f.confirmed,cost.quantity);
      f.confirmed-=confirmed;f.conditional-=cost.quantity-confirmed;
      entry(at,source,cost.resourceId,-cost.quantity,reserve?'reservation':'inventory',conditional?'conditional':'confirmed');
    }
    return true;
  }
  function offerJob(offer:Offer,at:number,quantity:number):void {
    if(!quantity)return;
    job(at,30,()=>{
      if(offer.minimumRank!==null&&(scenario.rank===null||scenario.rank<offer.minimumRank)){
        issue(offer.id,'必要ランクを満たすと確認できないため購入を保留しました',offer.costs.map(c=>c.resourceId),false);return;
      }
      const costs=offer.costs.map(c=>({...c,quantity:integer(BigInt(c.quantity)*BigInt(quantity))}));
      // A policy is atomic: never silently reduce a requested purchase quantity.
      const conditioned=offer.scope==='event'||costs.some(c=>(funds.get(c.resourceId)?.confirmed??0)<c.quantity);
      if(spend(at,offer,costs,false,conditioned))rewards(at,offer,offer.rewards,one,quantity,conditioned?'conditional':'confirmed');
    });
  }
  if(!definition)issue('supply','供給定義が未登録です。供給・交換を計算できません');
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
    const eventClaims=new Map<string,number>();
    for(const selected of scenario.events){
      const event=definition.events.find(e=>e.id===selected.eventId);
      if(!event){issue(selected.eventId,'選択したイベントの定義がありません');continue;}
      const at=Math.max(startOfDate(selected.claimDate,offset),Date.parse(event.startsAt));
      if(at>=Date.parse(event.endsAt)||at>=end||at<start)throw new Error('イベントの受取日が開催期間外です');
      if(selected.fullCollection&&selected.points!==null&&event.milestones.some(m=>m.points>selected.points!))throw new Error('イベント全回収に必要な累計ptを満たしていません');
      eventClaims.set(event.id,at);
      if(!selected.fullCollection&&selected.points===null){
        const ids=[...new Set(event.milestones.flatMap(m=>inventoryIds(m.rewards)))];
        issue('event:'+event.id,'累計報酬の到達ptが未設定です',ids,ids.length>0);
      }
      for(const milestone of event.milestones){
        if(selected.fullCollection&&milestone.excludeOnFullCollection)continue;
        if(selected.fullCollection||selected.points!==null&&selected.points>=milestone.points){
          const source={...event,id:'event:'+event.id+':'+milestone.points,name:event.name+' 累計報酬'};
          job(at,10,()=>rewards(at,source,milestone.rewards,one,1,'conditional'));
        }
      }
      if(event.repeat){
        const source={...event,id:'event:'+event.id+':repeat',name:event.name+' 繰り返し報酬'};
        if(selected.points===null)missingRewards(source,event.repeat.rewards,'到達ptが未設定のため繰り返し報酬の数量は未確認です');
        else {const count=Math.max(0,Math.floor((selected.points-event.repeat.startsAfter)/event.repeat.everyPoints));
          if(count)job(at,10,()=>rewards(at,source,event.repeat!.rewards,one,count,'conditional'));}
      }
    }
    for(const offer of definition.offers){
      const policy=scenario.purchases.find(p=>p.offerId===offer.id);
      const event=scenario.events.find(e=>e.eventId===offer.eventId);
      const allLimited=event?.buyLimited&&offer.limit!==null;
      if(!policy&&!allLimited)continue;
      let from=start,to=end;
      if(offer.window){from=Math.max(from,Date.parse(offer.window.startsAt));to=Math.min(to,Date.parse(offer.window.endsAt));}
      if(offer.eventId){
        const e=definition.events.find(e=>e.id===offer.eventId)!;
        const claim=eventClaims.get(e.id);
        if(claim===undefined){issue(offer.id,'イベントの受取条件が未設定です',offer.costs.map(c=>c.resourceId),false);continue;}
        from=Math.max(from,claim);if(!offer.window)to=Math.min(to,Date.parse(e.endsAt));
      }
      const dates=opportunities(from,to,offer.reset,offset);
      dates.forEach((at,index)=>{
        const used=index===0?(policy?.alreadyPurchased??0):0;
        if(offer.limit!==null&&used>offer.limit){issue(offer.id,'購入済み数が商品上限を超えています',offer.costs.map(c=>c.resourceId),false);return;}
        const remaining=offer.limit===null?Infinity:Math.max(offer.limit-used,0);
        const quantity=allLimited?remaining:policy!.quantity;
        if(quantity>remaining){issue(offer.id,'購入方針が残り購入上限を超えています',offer.costs.map(c=>c.resourceId),false);return;}
        offerJob(offer,at,quantity);
      });
      if(!dates.length)issue(offer.id,'試算期間内に購入できる機会がありません',[],false);
    }
    for(const p of scenario.purchases)if(!definition.offers.some(o=>o.id===p.offerId))issue(p.offerId,'選択した商品定義がありません');
    if(scenario.pass){
      const selection=scenario.pass,p=definition.passes.find(p=>p.id===selection.passId);
      if(!p)issue(selection.passId,'選択したパスの定義がありません');
      else{
        const begins=startOfDate(selection.startsOn,offset),expires=begins+p.durationDays*DAY;
        job(begins,5,()=>{pay(p.priceYen);rewards(begins,{...p,name:p.name+' 購入時'},p.purchase,one,1,'conditional');});
        for(const date of selection.claimDates){
          const at=startOfDate(date,offset);
          if(at<begins||at>=expires||at<start||at>=end)throw new Error('パス受取日は契約期間と試算期間内に指定してください');
          job(at,10,()=>rewards(at,{...p,name:p.name+' 日次'},p.daily,one,1,'conditional'));
          const active=definition.events.filter(e=>Date.parse(e.startsAt)<at+DAY&&Date.parse(e.endsAt)>at);
          if(active.length){const eventAt=Math.max(at,Math.min(...active.map(e=>Date.parse(e.startsAt))));job(eventAt,10,()=>rewards(eventAt,{...p,name:p.name+' イベント日次'},p.eventDaily,one,1,'conditional'));}
          else if(hasRewards(p.eventDaily)&&(!definition.eventCoverage||at<Date.parse(definition.eventCoverage.startsAt)||at+DAY>Date.parse(definition.eventCoverage.endsAt)))missingRewards(p,p.eventDaily,'イベント開催定義の収録期間外のためイベント日次特典は未確認です');
        }
        const a=Math.max(start,begins),b=Math.min(end,expires);
        if(!p.weeklyReset&&hasRewards(p.weekly))missingRewards(p,p.weekly,'パスの週次リセット時点が未確認です');
        for(const at of p.weeklyReset?opportunities(a,b,p.weeklyReset,offset):[]){
          if(at===start&&begins<start){missingRewards(p,p.weekly,'契約開始後の週次特典は、期間開始時点の受取状況が未確認です');continue;}
          job(at,10,()=>rewards(at,{...p,name:p.name+' 週次権利'},p.weekly,one,1,'conditional'));
        }
      }
    }
    for(const selected of scenario.fixedSources){
      const source=definition.fixedSources.find(f=>f.id===selected.sourceId);
      if(!source){issue(selected.sourceId,'固定報酬の定義がありません');continue;}
      const a=Math.max(start,source.window?Date.parse(source.window.startsAt):start),b=Math.min(end,source.window?Date.parse(source.window.endsAt):end);
      const dates=opportunities(a,b,source.reset,offset);
      if(selected.claims>dates.length)throw new Error('固定報酬の受取回数が期間内の機会を超えます');
      for(const at of dates.slice(0,selected.claims))job(at,10,()=>{pay(source.priceYen);rewards(at,source,source.rewards,one,1,'conditional');});
    }
  }
  for(const income of scenario.externalIncome){
    const at=startOfDate(income.date,offset),source={...income,id:'external:'+income.id,basis:'シナリオの外部入力'};
    job(at,10,()=>{for(const a of income.amounts)entry(at,source,a.resourceId,a.quantity,'inventory','conditional');});
  }
  for(const allocation of scenario.allocations){
    const at=startOfDate(allocation.date,offset),source={...allocation,id:'allocation:'+allocation.id,basis:'選択した用途: '+allocation.purpose};
    job(at,20,()=>{spend(at,source,allocation.costs,allocation.purpose==='reserve');});
  }
  jobs.sort((a,b)=>a.at-b.at||a.priority-b.priority||a.order-b.order).forEach(j=>j.run());
  const initial=materialInventoryBalances(requirements,inventory);
  const finalInventory=Object.fromEntries([...funds].filter(([,f])=>f.known).map(([id,f])=>[id,safe(f.confirmed+f.conditional)]));
  const afterFixed=materialInventoryBalances(requirements,finalInventory);
  const original=new Map(initial.balances.map(r=>[r.resource.id,r]));
  const final=new Map(afterFixed.balances.map(r=>[r.resource.id,r]));
  const byResource=new Map<string,LedgerEntry[]>();
  for(const e of ledger)if(e.destination==='inventory'||e.destination==='reservation'){
    if(!byResource.has(e.resourceId))byResource.set(e.resourceId,[]);byResource.get(e.resourceId)!.push(e);
  }
  const rows=resources.map(resource=>{
    const entries=byResource.get(resource.id)??[];
    const sum=(filter:(e:LedgerEntry)=>boolean)=>entries.filter(filter).reduce((n,e)=>safe(n+e.quantity),0);
    const stock=Object.hasOwn(inventory,resource.id)?inventory[resource.id]!:null;
    const fixedStock=stock===null?null:finalInventory[resource.id]!;
    const expectedIncome=sum(e=>e.certainty==='expected');
    const supplyIncomplete=issues.some(i=>i.blocksProjection&&(!i.resourceIds.length||i.resourceIds.includes(resource.id)));
    const estimatedStock=fixedStock===null||supplyIncomplete?null:safe(fixedStock+expectedIncome);
    const required=original.get(resource.id)?.required??0;
    return {resource,currency:definition?.currencies.includes(resource.id)??false,required,stock,
      currentShortage:original.get(resource.id)?.shortage??null,
      confirmedIncome:sum(e=>e.quantity>0&&e.certainty==='confirmed'),conditionalIncome:sum(e=>e.quantity>0&&e.certainty==='conditional'),expectedIncome,
      spent:Math.abs(sum(e=>e.quantity<0&&e.destination==='inventory')),reserved:Math.abs(sum(e=>e.destination==='reservation')),
      fixedStock,estimatedStock,shortageAfterFixed:final.get(resource.id)?.shortage??null,
      estimatedShortage:estimatedStock===null||requirements.incomplete?null:Math.max(0,required-estimatedStock),
      supplyIncomplete,demandIncomplete:requirements.incomplete,sources:[...new Set(entries.map(e=>e.sourceName))]};
  });
  return {format:'atsudori-tools/economy-result' as const,schemaVersion:1 as const,
    catalog:{catalogId:master.catalogId,revision:master.revision,supplyRevision:definition?.revision??null},
    scenario,period:{startsAt:iso(start),endsAt:iso(end),days,utcOffsetMinutes:definition?.utcOffsetMinutes??null},
    assumptions:['開始日・終了日を含む期間です。','条件付き報酬は選択した受取・達成・購入を前提とします。',
      '期待値は抽選の平均です。購入資金には含めません。','期間開始時の残り購入枠は購入済み数の入力を使います。',
      '通常ライブとスキップのLBは期間全体で配分し、スキップ分を切り捨てます。',
      '同日時は収入、用途配分、商品の定義順に処理します。日次ライブ報酬は日末に受け取ります。',
      '練習は期間末にも受け取り、受取ごとに蓄積単位未満の時間を切り捨てます。',
      'デイリー・固定報酬は指定回数分を期間内の早い受取機会から数えます。'],
    rows,ledger,issues,cashCostYen,requirementsIncomplete:requirements.incomplete,
    unsupportedInventory:initial.unsupported,
    entitlements:ledger.filter(e=>e.destination==='entitlement'),directRewards:ledger.filter(e=>e.destination==='direct'),
    dates:[...new Set(ledger.map(e=>localDate(Date.parse(e.at),offset)))]};
}
export type EconomyResult=ReturnType<typeof calculateEconomy>;
