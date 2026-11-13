import {loadCatalog, CATALOG_STORAGE_KEY, STORAGE_KEY} from '../../src/storage/local';
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
const snapshot = syntheticCollection(syntheticCatalog());
const run = (d: ReturnType<typeof sealDefinition>, s: Parameters<typeof calculateSealBudget>[1]) => calculateSealBudget(d, s, snapshot);
const scenario=()=>({...defaultSealBudgetScenario(),cm:true,pass:true,selectedProducts:['fictional-paper']});
it.each([0,1,2] as const)('30 day income and full tier expense, paid=%s',paid=>{
 const r=run(sealDefinition(),{...scenario(),paid});
 // CM=120*(.2*10+.3*20+2*7)=2640; paid counts R only: 30*n*8.
 expect(r.totalIncome).toBe(2640+240*paid);expect(r.totalExpense).toBe(67);expect(r.balance).toBe(2573+240*paid);
 expect(r.income[0]).toMatchObject({member:240,snap:720,points:1680});expect(r.income[1]!.draws).toBeCloseTo(30/7);expect(r.income[1]!.total).toBe(0);
});
it('defaults are off and do not materialize stored values',()=>{expect(run(sealDefinition(),defaultSealBudgetScenario())).toMatchObject({totalIncome:0,totalExpense:0,balance:0,notes:[]});});
it('unknown atoms preserve known components and original nulls',()=>{const d=sealDefinition();d.cards[0]!.duplicateReward=null;d.products[0]!.tiers[0]!.monthlyLimit=null;
 const r=run(d,scenario());expect(r.totalIncome).toBe(2400);expect(r.totalExpense).toBe(34);expect(r.notes).toHaveLength(2);expect(d.cards[0]!.duplicateReward).toBeNull();});
it('zero probability does not require a conversion value',()=>{const d=sealDefinition();d.cards[0]!.duplicateReward=null;expect(run(d,{...scenario(),cm:false}).notes).toEqual([]);});
it.each(['negative','overflow','bad sum','duplicate','missing','unknown key','invalid tier','empty tiers'])( 'rejects %s',kind=>{
 const d=sealDefinition();if(kind==='negative')d.cards[0]!.duplicateReward={kind:'seals',amount:-1};if(kind==='overflow')d.gachas[0]!.draws=Infinity;if(kind==='bad sum')d.pools[0]!.otherProbability=6000;if(kind==='duplicate')d.gachas[1]!.id='cm';if(kind==='missing')d.gachas.pop();if(kind==='unknown key')Object.assign(d,{extra:1});if(kind==='invalid tier')d.products[0]!.tiers[0]!.sealCost=-1;if(kind==='empty tiers')d.products[0]!.tiers=[];
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

it.each([0,1,2].flatMap(event=>[0,1,2].map(paid=>({event,paid}))))('independent event/paid counts: %o',({event,paid})=>{
 const r=run(sealDefinition(),{...scenario(),event:event as 0|1|2,paid:paid as 0|1|2});
 expect(r.totalIncome).toBe(2640+660*event+240*paid);
 expect(r.balance).toBe(2573+660*event+240*paid);
 expect(r.income.find(g=>g.id==='paid')!.points).toBe(0);
 expect(r.income.find(g=>g.id==='event')!.points).toBe(420*event);
});
it('preserves legacy paid selection without assuming event draws',()=>{
 const legacy={cm:false,pass:false,paid:2 as const,selectedProducts:[]};
 expect(validateSealBudgetScenario(legacy)).toEqual(legacy);
 expect(run(sealDefinition(),legacy).totalIncome).toBe(480);
 expect(()=>validateSealBudgetDefinition({...sealDefinition(),version:1})).toThrow('再Import');
});

it.each([1, 2, 999])('refuses definition version %s on validation, import, calculation and stored load', version => {
 const master = {...syntheticCatalog(), sealBudgetDefinition: sealDefinition()};
 Object.assign(master.sealBudgetDefinition, {version});
 const before = structuredClone(master);
 expect(() => validateSealBudgetDefinition(master.sealBudgetDefinition)).toThrow('v3を含むマスタを再Import');
 expect(() => importCatalog(JSON.stringify(master))).toThrow('再Import');
 expect(() => calculateSealBudget(master.sealBudgetDefinition, scenario(), snapshot)).toThrow('再Import');
 const data = new Map([[CATALOG_STORAGE_KEY, JSON.stringify(master)], [STORAGE_KEY, JSON.stringify(snapshot)]]);
 const storage = {getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => {data.set(key, value);}};
 const bytes = [...data];
 expect(loadCatalog(storage).status).toBe('invalid');
 expect([...data]).toEqual(bytes);
 expect(master).toEqual(before);
});
