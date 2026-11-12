import type { Masterdata } from '../../data/catalog/model';
import type { SupplyConditions, Rewards, SupplyDefinition } from './model';
import { supplyConditionsSchema, supplyDefinitionSchema } from './schema';

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
export function validateSupplyDefinition(value:unknown):SupplyDefinition {
  const d=structural<SupplyDefinition>(value,supplyDefinitionSchema);
  for(const rows of [d.lives,d.fixedSources])unique(rows.map(r=>r.id),'供給ID');
  unique(d.currencies,'通貨ID');unique(d.ranks.map(r=>r.rank),'ランク');
  unique(d.studios.map(r=>r.bandId+':'+r.level),'練習Lv');
  for(const r of d.lives)for(const grant of [...r.perLb.fixed,...r.perLb.lotteries.flatMap(l=>l.outcomes.flatMap(o=>o.rewards))])
    if(grant.destination==='direct')throw new Error('直接EXPはライブ回数ごとの報酬に分離してください');
  for(const r of d.studios){
    if(r.normalMinutes%r.tickMinutes||r.capMinutes!==null&&(r.capMinutes<r.normalMinutes||r.capMinutes%r.tickMinutes))throw new Error('練習時間・上限は蓄積単位の倍数で指定してください');
    if(r.overflowRate&&r.overflowRate.numerator>r.overflowRate.denominator)throw new Error('超過時の練習効率は1以下で指定してください');
  }
  const all:Rewards[]=[...d.lives.flatMap(r=>[r.perLb,r.perPlay]),...d.studios.map(r=>r.rewards),
    ...d.ranks.flatMap(r=>r.daily?[r.daily]:[]),...(d.standardEvent?[d.standardEvent.cumulative,d.standardEvent.limited]:[]),
    ...d.fixedSources.map(f=>f.rewards)];
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
export function validateSupplyConditions(value:unknown):SupplyConditions {
  const s=structural<SupplyConditions>(value,supplyConditionsSchema);
  unique(s.studioLevels.map(r=>r.bandId),'練習バンド');
  return s;
}
