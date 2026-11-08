import {it,expect} from 'vitest';
import {economyFixture} from '../helpers/economy';
import {calculateEconomy} from '../../src/domain/economy/calculate';
import {importEconomyScenario,exportEconomyScenario} from '../../src/domain/economy/validate';
import {createEconomyStore} from '../../src/storage/economy';
for(const [days,expected] of [[30,90],[90,270],[365,1095]])it(`forecasts ${days} days with fractional event counts`,()=>{
 const f=economyFixture();f.scenario.endDate=new Date(Date.parse(f.scenario.startDate)+ (days!-1)*86400000).toISOString().slice(0,10);
 const before=JSON.stringify(f);const r=calculateEconomy(f.m,f.c.resourceInventory!,f.requirements,f.scenario);
 expect(r.rows.find(x=>x.resource.id==='paper')!.eventIncome).toBe(expected);expect(r.rows.find(x=>x.resource.id==='paper')!.estimatedStock).toBe(expected);expect(r.eventForecast!.equivalentEvents).toBe(days!/10);expect(JSON.stringify(f)).toBe(before);
 f.scenario.startDate='2025-01-01';f.scenario.endDate=new Date(Date.parse(f.scenario.startDate)+(days!-1)*86400000).toISOString().slice(0,10);
 expect(calculateEconomy(f.m,f.c.resourceInventory!,f.requirements,f.scenario).eventForecast!.equivalentEvents).toBe(days!/10);
});
it('preserves unknown stock and missing event rewards',()=>{
 const f=economyFixture();delete f.c.resourceInventory!.paper;
 const run=()=>calculateEconomy(f.m,f.c.resourceInventory!,f.requirements,f.scenario);
 expect(run().rows.find(x=>x.resource.id==='paper')!.estimatedShortage).toBeNull();
 f.supply.standardEvent=null;expect(run().issues.some(x=>x.sourceId==='standard-event')).toBe(true);
});
it('rejects obsolete scenario fields and protects old browser bytes',()=>{
 const f=economyFixture();expect(importEconomyScenario(exportEconomyScenario(f.scenario))).toEqual(f.scenario);
 for(const schemaVersion of [1,2,3])expect(()=>importEconomyScenario(JSON.stringify({...f.scenario,schemaVersion}))).toThrow();expect(()=>importEconomyScenario(JSON.stringify({...f.scenario,purchases:[]}))).toThrow();
 const map=new Map([['atsudori-tools.economy-scenario.v3','legacy']]);const store=createEconomyStore({getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);}},f.scenario);expect(store.protected()).toBe(true);expect(()=>store.update(f.scenario)).toThrow();expect(map.get('atsudori-tools.economy-scenario.v3')).toBe('legacy');
});
it('validates the new catalog contract and excludes unsupported event payloads',async()=>{
 const {validateSupplyDefinition}=await import('../../src/domain/economy/validate');
 const {importCatalog,exportCatalog}=await import('../../src/data/catalog/validate');
 const f=economyFixture();expect(importCatalog(exportCatalog(f.m))).toEqual(f.m);
 expect(()=>validateSupplyDefinition({...f.supply,offers:[]})).toThrow();
 expect(()=>validateSupplyDefinition({...f.supply,standardEvent:{...f.supply.standardEvent,unlimited:[]}})).toThrow();

});
it('keeps recurring free rewards and estimates shortage and clearance from total daily supply',()=>{
 const f=economyFixture();f.supply.fixedSources=[{id:'daily-basic',name:'架空の日次報酬',basis:'独立した固定供給',reset:{kind:'daily',hour:0},window:null,rewards:{fixed:[{resourceId:'paper',quantity:5,destination:'inventory'}],lotteries:[],unavailable:[]}}];f.scenario.fixedSources=[{sourceId:'daily-basic',claims:1}];
 const r=calculateEconomy(f.m,f.c.resourceInventory!,f.requirements,f.scenario).rows.find(x=>x.resource.id==='paper')!;
 expect(r.conditionalIncome).toBe(5);expect(r.eventIncome).toBe(3);expect(r.estimatedShortage).toBe(1992);expect(r.clearanceDays).toBe(250);
});
it('structural schemas accept the baseline contract and reject retired paid payloads',async()=>{
 const {default:Ajv}=await import('ajv/dist/2020');const {readFileSync}=await import('node:fs');const f=economyFixture();
 const ajv=new Ajv({strict:false});const supply=ajv.compile(JSON.parse(readFileSync('public/schemas/catalog-v1.schema.json','utf8')));const scenario=ajv.compile(JSON.parse(readFileSync('public/schemas/economy-scenario-v4.schema.json','utf8')));
 expect(supply(f.m)).toBe(true);expect(scenario(f.scenario)).toBe(true);
 expect(supply({...f.m,supplyDefinition:{...f.supply,passes:[]}})).toBe(false);
 expect(supply({...f.m,supplyDefinition:{...f.supply,fixedSources:[{id:'old-paid',name:'旧有料定義',basis:'拒否対象',category:'paid',priceYen:1,reset:{kind:'daily',hour:0},window:null,rewards:{fixed:[],lotteries:[],unavailable:[]}}]}})).toBe(false);expect(scenario({...f.scenario,pass:null})).toBe(false);
});
