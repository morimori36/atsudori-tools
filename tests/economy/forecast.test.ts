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
it('scales pass event rights separately and preserves unknown stock',()=>{
 const f=economyFixture();f.scenario.pass={passId:'short-pass'};delete f.c.resourceInventory!.paper;
 const r=calculateEconomy(f.m,f.c.resourceInventory!,f.requirements,f.scenario);expect(r.entitlements.filter(x=>x.certainty==='estimated')[0]!.quantity).toBe(.7);expect(r.rows.find(x=>x.resource.id==='paper')!.estimatedShortage).toBeNull();
 f.supply.standardEvent!.activeDays=null;expect(calculateEconomy(f.m,f.c.resourceInventory!,f.requirements,f.scenario).issues.some(x=>x.reason.includes('標準開催日数'))).toBe(true);
});
it('rejects obsolete scenario fields and protects old browser bytes',()=>{
 const f=economyFixture();expect(importEconomyScenario(exportEconomyScenario(f.scenario))).toEqual(f.scenario);
 for(const schemaVersion of [1,2])expect(()=>importEconomyScenario(JSON.stringify({...f.scenario,schemaVersion}))).toThrow();expect(()=>importEconomyScenario(JSON.stringify({...f.scenario,purchases:[]}))).toThrow();
 const map=new Map([['atsudori-tools.economy-scenario.v2','legacy']]);const store=createEconomyStore({getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);}},f.scenario);expect(store.protected()).toBe(true);expect(()=>store.update(f.scenario)).toThrow();expect(map.get('atsudori-tools.economy-scenario.v2')).toBe('legacy');
});
it('validates the new catalog contract and excludes unsupported event payloads',async()=>{
 const {validateSupplyDefinition}=await import('../../src/domain/economy/validate');
 const {importCatalog,exportCatalog}=await import('../../src/data/catalog/validate');
 const f=economyFixture();expect(importCatalog(exportCatalog(f.m))).toEqual(f.m);
 expect(()=>validateSupplyDefinition({...f.supply,offers:[]})).toThrow();
 expect(()=>validateSupplyDefinition({...f.supply,standardEvent:{...f.supply.standardEvent,unlimited:[]}})).toThrow();
 expect(()=>validateSupplyDefinition({...f.supply,standardEvent:{...f.supply.standardEvent,activeDays:11}})).toThrow();
});
it('compares all imported pass grades with unchanged standard supply',()=>{
 const f=economyFixture();f.supply.passes=[1,2,3].map(n=>({...f.supply.passes[0]!,id:'grade-'+n,daily:{fixed:[{resourceId:'tokens-b',quantity:3*n,destination:'inventory'}],lotteries:[],unavailable:[]}}));
 for(const [i,p] of f.supply.passes.entries()){f.scenario.pass={passId:p.id};const r=calculateEconomy(f.m,f.c.resourceInventory!,f.requirements,f.scenario);expect(r.rows.find(x=>x.resource.id==='tokens-b')!.passIncome).toBe(3*(i+1));expect(r.rows.find(x=>x.resource.id==='paper')!.eventIncome).toBe(3);}
});
