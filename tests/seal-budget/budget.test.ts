import {it,expect} from 'vitest';
import Ajv from 'ajv/dist/2020';
import {readFileSync} from 'node:fs';
import {sealDefinition} from '../helpers/seal-budget';
import {syntheticCatalog,syntheticCollection} from '../helpers/synthetic';
import {calculateSealBudget} from '../../src/domain/seal-budget/calculate';
import {defaultSealBudgetScenario} from '../../src/domain/seal-budget/model';
import {validateSealBudgetDefinition,validateSealBudgetScenario} from '../../src/domain/seal-budget/validate';
import {importCatalog,exportCatalog} from '../../src/data/catalog/validate';
import {importCollection,exportCollection,validateCollection} from '../../src/storage/collection';
import {prepareCollectionImport} from '../../src/storage/collection-import';
const scenario=()=>({...defaultSealBudgetScenario(),cm:true,pass:true,selectedProducts:['fictional-paper']});
it.each([0,1,2] as const)('30 day income and full tier expense, paid=%s',paid=>{
 const r=calculateSealBudget(sealDefinition(),{...scenario(),paid});
 // One draw = .2*10 + .3*20 + 2*7 = 22. CM=120 draws; paid=30*n.
 expect(r.totalIncome).toBe(2640+660*paid);expect(r.totalExpense).toBe(67);expect(r.balance).toBe(2573+660*paid);
 expect(r.income[0]).toMatchObject({member:240,snap:720,points:1680});expect(r.income[1]!.draws).toBeCloseTo(30/7);expect(r.income[1]!.total).toBe(0);
});
it('defaults are off and do not materialize stored values',()=>{expect(calculateSealBudget(sealDefinition(),defaultSealBudgetScenario())).toMatchObject({totalIncome:0,totalExpense:0,balance:0,notes:[]});});
it('unknown atoms preserve known components and original nulls',()=>{const d=sealDefinition();d.gachas[0]!.memberSeals=null;d.products[0]!.tiers[0]!.monthlyLimit=null;
 const r=calculateSealBudget(d,scenario());expect(r.totalIncome).toBe(2400);expect(r.totalExpense).toBe(34);expect(r.notes).toHaveLength(2);expect(d.gachas[0]!.memberSeals).toBeNull();});
it('zero probability does not require a conversion value',()=>{const d=sealDefinition();d.gachas[1]!.memberSeals=null;expect(calculateSealBudget(d,scenario()).notes).toEqual([]);});
it.each(['negative','overflow','bad sum','duplicate','missing','unknown key','invalid tier','empty tiers'])( 'rejects %s',kind=>{
 const d=sealDefinition();if(kind==='negative')d.gachas[0]!.memberSeals=-1;if(kind==='overflow')d.gachas[0]!.draws=Infinity;if(kind==='bad sum')d.gachas[0]!.otherProbabilityBp=6000;if(kind==='duplicate')d.gachas[1]!.id='cm';if(kind==='missing')d.gachas.pop();if(kind==='unknown key')Object.assign(d,{extra:1});if(kind==='invalid tier')d.products[0]!.tiers[0]!.sealCost=-1;if(kind==='empty tiers')d.products[0]!.tiers=[];
 expect(()=>validateSealBudgetDefinition(d)).toThrow();
});
it.each([{paid:3},{cm:0},{selectedProducts:['missing']},{selectedProducts:['fictional-paper','fictional-paper']}])('rejects invalid scenario',change=>{expect(()=>validateSealBudgetScenario({...scenario(),...change},sealDefinition())).toThrow();});
it('round trips schemas, catalog and collection; preserves missing settings',()=>{
 const m={...syntheticCatalog(),sealBudgetDefinition:sealDefinition()},c={...syntheticCollection(m),sealBudgetScenario:scenario()};
 for(const [name,value] of [['catalog',m],['collection',c]] as const){const v=new Ajv({strict:true,multipleOfPrecision:10}).compile(JSON.parse(readFileSync(`public/schemas/${name}-v1.schema.json`,'utf8')));expect(v(value),JSON.stringify(v.errors)).toBe(true);}
 expect(importCatalog(exportCatalog(m))).toEqual(m);expect(importCollection(exportCollection(c,m),m)).toEqual(c);
 expect(prepareCollectionImport(syntheticCollection(m),c,m).sealBudgetScenario).toEqual(scenario());
 expect(prepareCollectionImport(syntheticCollection(m),c,m,false).sealBudgetScenario).toBeUndefined();
 expect(()=>validateCollection(c,{...m,sealBudgetDefinition:undefined})).toThrow();
 expect(()=>validateCollection(c,{...m,sealBudgetDefinition:{...sealDefinition(),products:[]}})).toThrow();
});
