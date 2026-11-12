import { strictObject } from '../../data/json.ts';
import { GACHA_KINDS } from './model.ts';
import type { SealBudgetDefinition, SealBudgetScenario } from './model.ts';
const fail = (): never => { throw new Error('シール予算: 定義・条件または参照が不正です'); };
const id = (v:unknown):string => typeof v==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(v) ? v : fail();
const name = (v:unknown):string => typeof v==='string' && !!v.trim() && v.length<=200 ? v : fail();
const number = (v:unknown,max=1e9):number|null => v===null ? null : typeof v==='number' && Number.isSafeInteger(v) && v>=0 && v<=max ? v : fail();
const rows = (v:unknown,max:number):unknown[] => Array.isArray(v) && v.length<=max ? v : fail();
const unique = (v:string[]):void => {if(new Set(v).size!==v.length)fail();};
export function validateSealBudgetDefinition(value:unknown):SealBudgetDefinition {
 const d=strictObject(value,'sealBudgetDefinition',['version','revision','gachas','products']);
 if(d.version!==2)throw new Error('シール予算定義v2を含むマスタを再Importしてください。旧定義は対応していません');
 const gachas=rows(d.gachas,4).map(v=>{
  const r=strictObject(v,'gacha',['id','name','draws','periodDays','memberProbabilityBp','snapProbabilityBp','otherProbabilityBp','memberSeals','snapSeals','pointsPerDraw','sealsPerPoint','paidStarsPerDraw']);
  if(!GACHA_KINDS.includes(r.id as never))fail();
  const draws=number(r.draws);if(!draws)return fail();
  if(typeof r.periodDays!=='number'||!Number.isFinite(r.periodDays)||r.periodDays<0.01||r.periodDays>1e6)return fail();
  const probabilities=['memberProbabilityBp','snapProbabilityBp','otherProbabilityBp'].map(k=>number(r[k],10000));
  const sum=probabilities.reduce<number>((s,p)=>s+(p??0),0);
  if(sum>10000 || (probabilities.every(p=>p!==null)&&sum!==10000))fail();
  return {id:r.id as 'cm'|'pass'|'paid'|'event',name:name(r.name),draws,periodDays:r.periodDays,
    memberProbabilityBp:probabilities[0]!,snapProbabilityBp:probabilities[1]!,otherProbabilityBp:probabilities[2]!,
    memberSeals:number(r.memberSeals),snapSeals:number(r.snapSeals),pointsPerDraw:number(r.pointsPerDraw),sealsPerPoint:number(r.sealsPerPoint),paidStarsPerDraw:number(r.paidStarsPerDraw)};
 });
 unique(gachas.map(g=>g.id));if(gachas.length!==4)fail();
 const products=rows(d.products,200).map(v=>{const r=strictObject(v,'product',['id','name','tiers']);
  const tiers=rows(r.tiers,20).map(v=>{const t=strictObject(v,'tier',['sealCost','monthlyLimit']);return {sealCost:number(t.sealCost),monthlyLimit:number(t.monthlyLimit)};});
  if(!tiers.length)fail();return {id:id(r.id),name:name(r.name),tiers};
 });
 unique(products.map(p=>p.id));return {version:2,revision:id(d.revision),gachas,products};
}
export function validateSealBudgetScenario(value:unknown,definition?:SealBudgetDefinition):SealBudgetScenario {
 const s=strictObject(value,'sealBudgetScenario',['cm','pass','paid','event','selectedProducts'],['cm','pass','paid','selectedProducts']);
 if(typeof s.cm!=='boolean'||typeof s.pass!=='boolean'||![0,1,2].includes(s.paid as number))return fail();
 if(s.event!==undefined && ![0,1,2].includes(s.event as number))return fail();
 const selectedProducts=rows(s.selectedProducts,200).map(id);unique(selectedProducts);
 if(definition && selectedProducts.some(id=>!definition.products.some(p=>p.id===id)))fail();
 return {cm:s.cm,pass:s.pass,paid:s.paid as 0|1|2,...(s.event===undefined?{}:{event:s.event as 0|1|2}),selectedProducts};
}
