import { jsonValue } from '../../data/json';
import type { Masterdata } from '../../data/catalog/model';
import type { EconomyScenario, Rewards, Reset, SupplyDefinition, Window } from './model';
import { economyScenarioSchema, supplyDefinitionSchema } from './schema';
import { dateValue, period } from './time';

type Shape = {type?:string;enum?:readonly unknown[];const?:unknown;anyOf?:Shape[];not?:Shape;
  minimum?:number;maximum?:number;minLength?:number;maxLength?:number;pattern?:string;
  maxItems?:number;items?:Shape;properties?:Record<string,Shape>;required?:string[]};
/** The limited, declarative schema vocabulary used by these two contracts. No coercion or defaults. */
function structural<T>(value:unknown,schema:unknown):T {
  let nodes=0;
  function check(v:unknown,s:Shape,path:string):void {
    if(++nodes>200000)throw new Error('供給定義・試算条件の要素数が上限を超えます');
    const fail=():never=>{throw new Error(path+': 供給定義・試算条件の形式が不正です');};
    if(s.anyOf){if(!s.anyOf.some(variant=>{try{check(v,variant,path);return true;}catch{return false;}}))fail();return;}
    if(s.not?.enum?.includes(v)||s.enum&&!s.enum.includes(v)||Object.hasOwn(s,'const')&&v!==s.const)fail();
    if(s.type==='null'){if(v!==null)fail();}
    if(s.type==='boolean'){if(typeof v!=='boolean')fail();}
    if(s.type==='integer'){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<(s.minimum??-Infinity)||v>(s.maximum??Infinity))fail();}
    if(s.type==='string'){
      if(typeof v!=='string'||v.length<(s.minLength??0)||v.length>(s.maxLength??Infinity)||s.pattern&&!new RegExp(s.pattern).test(v))fail();
    }
    if(s.type==='array'){
      if(!Array.isArray(v)||v.length>(s.maxItems??Infinity))fail();
      (v as unknown[]).forEach((item,i)=>check(item,s.items!,path+'['+i+']'));
    }
    if(s.type==='object'){
      if(!v||typeof v!=='object'||Array.isArray(v))fail();
      const obj=v as Record<string,unknown>;
      if(s.required?.some(key=>!Object.hasOwn(obj,key)))fail();
      for(const [key,item] of Object.entries(obj)){
        if(['__proto__','prototype','constructor'].includes(key)||!Object.hasOwn(s.properties!,key))fail();
        check(item,s.properties![key]!,path+'.'+key);
      }
    }
  }
  check(value,schema as Shape,'$');
  return JSON.parse(JSON.stringify(value)) as T;
}
const unique=(values:readonly (string|number)[],label:string):void=>{if(new Set(values).size!==values.length)throw new Error(label+'が重複しています');};
function reset(rule:Reset):void {
  if((rule.kind==='weekly')!==(rule.weekday!==undefined)||(rule.kind==='monthly')!==(rule.day!==undefined))throw new Error('リセットの曜日・日を正しく指定してください');
}
function window(value:Window):void {
  for(const text of [value.startsAt,value.endsAt]){
    const n=Date.parse(text);
    if(!Number.isFinite(n)||new Date(n).toISOString()!==text.replace('Z','.000Z'))throw new Error('開催期間の日時が不正です');
  }
  if(value.startsAt>=value.endsAt)throw new Error('開催期間の終了は開始より後が必要です');
}
export function validateSupplyDefinition(value:unknown):SupplyDefinition {
  const d=structural<SupplyDefinition>(value,supplyDefinitionSchema);
  for(const rows of [d.lives,d.passes,d.fixedSources])unique(rows.map(r=>r.id),'供給ID');
  unique(d.currencies,'通貨ID');unique(d.ranks.map(r=>r.rank),'ランク');
  unique(d.studios.map(r=>r.bandId+':'+r.level),'練習Lv');
  for(const r of d.lives)for(const grant of [...r.perLb.fixed,...r.perLb.lotteries.flatMap(l=>l.outcomes.flatMap(o=>o.rewards))])
    if(grant.destination==='direct')throw new Error('直接EXPはライブ回数ごとの報酬に分離してください');
  for(const r of d.studios){
    if(r.normalMinutes%r.tickMinutes||r.capMinutes!==null&&(r.capMinutes<r.normalMinutes||r.capMinutes%r.tickMinutes))throw new Error('練習時間・上限は蓄積単位の倍数で指定してください');
    if(r.overflowRate&&r.overflowRate.numerator>r.overflowRate.denominator)throw new Error('超過時の練習効率は1以下で指定してください');
  }
  if(d.standardEvent && d.standardEvent.activeDays!==null && d.standardEvent.activeDays>d.standardEvent.intervalDays)throw new Error('標準開催日数は開催間隔以下が必要です');
  for(const p of d.passes)if(p.weeklyReset){reset(p.weeklyReset);if(p.weeklyReset.kind!=='weekly')throw new Error('パスの週次リセットを指定してください');}
  for(const f of d.fixedSources){reset(f.reset);if(f.window)window(f.window);
    if(f.category==='oneTime'&&f.reset.kind!=='once')throw new Error('一度きりの報酬には一度きりのリセットを指定してください');
    if((f.category==='paid')!==(f.priceYen>0))throw new Error('有料報酬と価格の指定が一致しません');}
  const all:Rewards[]=[...d.lives.flatMap(r=>[r.perLb,r.perPlay]),...d.studios.map(r=>r.rewards),
    ...d.ranks.flatMap(r=>r.daily?[r.daily]:[]),...(d.standardEvent?[d.standardEvent.cumulative,d.standardEvent.limited]:[]),
    ...d.passes.flatMap(p=>[p.purchase,p.daily,p.weekly,p.eventDaily]),...d.fixedSources.map(f=>f.rewards)];
  for(const reward of all){
    unique(reward.fixed.map(g=>g.destination+':'+g.resourceId),'固定報酬');
    for(const lottery of reward.lotteries){
      const sum=lottery.outcomes.reduce((n,o)=>n+BigInt(o.weight),0n);
      if(sum!==BigInt(lottery.totalWeight))throw new Error('抽選テーブルの重み合計が一致しません');
      for(const o of lottery.outcomes)unique(o.rewards.map(g=>g.destination+':'+g.resourceId),'抽選報酬');
    }
  }
  return d;
}
export function supplyIssues(master:Masterdata):string[] {
  const d=master.supplyDefinition;if(!d)return [];
  const issues:string[]=[];
  const need=(ok:boolean,message:string)=>{if(!ok&&issues.length<100)issues.push('supplyDefinition: '+message);};
  need(d.catalogRevision===master.revision,'catalogの版が一致しません');
  const resources=new Set(master.materialDefinition?.resources.map(r=>r.id));
  const ref=(id:string)=>need(resources.has(id),'参照素材がありません: '+id);
  d.currencies.forEach(ref);
  d.studios.forEach(s=>need(master.bands.some(b=>b.id===s.bandId),'参照バンドがありません'));
  const walk=(value:unknown):void=>{
    if(Array.isArray(value)){value.forEach(walk);return;}
    if(!value||typeof value!=='object')return;
    for(const [key,v] of Object.entries(value)){
      if(key==='resourceId')ref(v as string);
      else if(key==='resourceIds')(v as string[]).forEach(ref);
      else walk(v);
    }
  };
  walk(d);
  return issues;
}
export function validateEconomyScenario(value:unknown):EconomyScenario {
  const s=structural<EconomyScenario>(value,economyScenarioSchema);
  const {days}=period(s.startDate,s.endDate,0);
  if(s.dailyClaims>days)throw new Error('デイリー受取日数が試算期間を超えます');
  unique(s.studio.levels.map(r=>r.bandId),'練習バンド');unique(s.fixedSources.map(r=>r.sourceId),'固定報酬');
  if(s.pass){dateValue(s.pass.startsOn);unique(s.pass.claimDates,'パスの受取日');s.pass.claimDates.forEach(dateValue);}
  return s;
}
export function importEconomyScenario(text:string):EconomyScenario {return validateEconomyScenario(jsonValue(text,5*1024*1024));}
export function exportEconomyScenario(value:EconomyScenario):string {return JSON.stringify(validateEconomyScenario(value),null,2)+'\n';}
export function emptyEconomyScenario(catalogId:string,date:string):EconomyScenario {
  return validateEconomyScenario({format:'atsudori-tools/economy-scenario',schemaVersion:2,catalogId,startDate:date,endDate:date,rank:null,
    live:{enabled:false,lbPerDay:0,skipPercent:0,playId:null,skipId:null,playsPerDay:null,skipsPerDay:null},
    studio:{enabled:false,levels:[],claimEveryMinutes:1440,minutesPerDay:1440},dailyClaims:0,includeEvents:true,pass:null,
    fixedSources:[]});
}
