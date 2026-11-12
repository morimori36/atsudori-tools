import {validateSealBudgetDefinition,validateSealBudgetScenario} from './validate';
import type {SealBudgetDefinition,SealBudgetScenario} from './model';
export function calculateSealBudget(definition:SealBudgetDefinition,scenario:SealBudgetScenario) {
 const d=validateSealBudgetDefinition(definition),s=validateSealBudgetScenario(scenario,d),notes:string[]=[];
 const multiply=(a:number|null,b:number|null,label:string):number=>{
  if(a===0||b===0)return 0;
  if(a===null||b===null){notes.push(label+'は未確認のため除外');return 0;}
  const n=a*b;if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)throw new Error('シール予算: 計算範囲を超えています');return n;
 };
 const income=d.gachas.map(g=>{
  const enabled=s[g.id],draws=enabled ? g.draws/g.periodDays*30*(g.id==='paid'?s.paid:1) : 0;
  const member=draws?multiply(g.memberProbabilityBp,g.memberSeals,g.name+'のRメンバー')/10000*draws:0;
  const snap=draws?multiply(g.snapProbabilityBp,g.snapSeals,g.name+'のRスナップ')/10000*draws:0;
  const points=draws?multiply(g.pointsPerDraw,g.sealsPerPoint,g.name+'のPt交換')*draws:0;
  return {id:g.id,name:g.name,draws,member,snap,points,total:member+snap+points};
 });
 const expenses=d.products.map(p=>({id:p.id,name:p.name,selected:s.selectedProducts.includes(p.id),total:s.selectedProducts.includes(p.id)?p.tiers.reduce((sum,t)=>sum+multiply(t.sealCost,t.monthlyLimit,p.name+'の価格・月上限'),0):0}));
 const totalIncome=income.reduce((sum,r)=>sum+r.total,0),totalExpense=expenses.reduce((sum,r)=>sum+r.total,0);
 for(const n of [totalIncome,totalExpense])if(!Number.isFinite(n)||n>Number.MAX_SAFE_INTEGER)throw new Error('シール予算: 計算範囲を超えています');
 return {income,expenses,totalIncome,totalExpense,balance:totalIncome-totalExpense,notes:[...new Set(notes)]};
}
