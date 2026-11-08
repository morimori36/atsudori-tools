import {it,expect} from 'vitest';
import {economyFixture,grant,reward} from '../helpers/economy';
import {calculateEconomy} from '../../src/domain/economy/calculate';
import {importEconomyScenario,exportEconomyScenario,validateSupplyDefinition} from '../../src/domain/economy/validate';
import {createEconomyStore,ECONOMY_STORAGE_KEY} from '../../src/storage/economy';
const run=(f:ReturnType<typeof economyFixture>)=>calculateEconomy(f.m,f.c.resourceInventory!,f.requirements,f.scenario);
const paper=(f:ReturnType<typeof economyFixture>)=>run(f).rows.find(x=>x.resource.id==='paper')!;
it('averages full standard event rewards independently of dates or a horizon',()=>{
 const f=economyFixture();const before=JSON.stringify(f);const r=run(f);
 expect(paper(f)).toMatchObject({required:2000,stock:0,shortage:2000,eventDaily:3,dailySupply:3,clearanceDays:667,status:'estimated'});
 expect(r.breakdown.every(e=>e.certainty==='estimated')).toBe(true);expect(JSON.stringify(f)).toBe(before);
 f.supply.standardEvent!.intervalDays=8;expect(paper(f).eventDaily).toBe(3.75);expect(paper(f).clearanceDays).toBe(534);
});
it('distinguishes fulfilled, positive supply, zero supply and unknown inputs',()=>{
 const f=economyFixture();f.scenario.includeEvents=false;
 expect(paper(f)).toMatchObject({dailySupply:0,shortage:2000,clearanceDays:null,status:'unreachable'});
 f.c.resourceInventory!.paper=2000;expect(paper(f)).toMatchObject({shortage:0,clearanceDays:0,status:'fulfilled'});
 f.c.resourceInventory!.paper=2200;expect(paper(f).shortage).toBe(0);
 delete f.c.resourceInventory!.paper;expect(paper(f)).toMatchObject({stock:null,shortage:null,clearanceDays:null,status:'unknown'});
 f.c.resourceInventory!.paper=0;f.requirements.incomplete=true;
 expect(paper(f)).toMatchObject({required:null,requiredSubtotal:2000,shortage:null,clearanceDays:null,status:'unknown'});
});
it('keeps missing event definitions and reward conditions unknown, with known subtotals',()=>{
 const f=economyFixture();f.supply.standardEvent!.limited.unavailable=[{reason:'未確認の通常報酬',resourceIds:['paper']}];
 expect(paper(f)).toMatchObject({dailySupply:null,knownDailySupply:3,status:'unknown'});
 f.supply.standardEvent=null;expect(paper(f).dailySupply).toBeNull();
 f.scenario.includeEvents=false;delete f.m.supplyDefinition;expect(paper(f).status).toBe('unknown');
});
it('needs no future supply when known stock already satisfies the known demand',()=>{
 const f=economyFixture();f.supply.standardEvent=null;f.c.resourceInventory!.paper=2000;
 expect(paper(f)).toMatchObject({dailySupply:null,clearanceDays:0,status:'fulfilled'});
});
it('averages recurring reward cadence and applies the same receive rate continuously',()=>{
 const f=economyFixture();f.scenario.includeEvents=false;
 f.supply.fixedSources=[{id:'weekly-basic',name:'架空の週次報酬',basis:'独立した継続供給',intervalDays:{numerator:7,denominator:1},rewards:reward(grant('paper',70))}];
 f.scenario.fixedSources=[{sourceId:'weekly-basic',claimPercent:50}];
 expect(paper(f)).toMatchObject({confirmedDaily:5,dailySupply:5,clearanceDays:400});
 f.scenario.includeRankDaily=true;expect(paper(f)).toMatchObject({dailySupply:10,clearanceDays:200});
 f.supply.fixedSources[0]!.intervalDays=null;expect(paper(f)).toMatchObject({dailySupply:null,knownDailySupply:5,status:'unknown'});
 f.scenario.fixedSources[0]!.claimPercent=0;expect(paper(f).dailySupply).toBe(5);
});
it('keeps unscoped missing inventory rewards unknown for every resource',()=>{
 const f=economyFixture();f.scenario.includeEvents=false;
 f.supply.fixedSources=[{id:'uncertain',name:'架空の周期不明報酬',basis:'独立した架空の不明条件',intervalDays:null,
   rewards:{...reward(grant('paper',70)),unavailable:[{reason:'対象素材不明',resourceIds:[]}]}}];
 f.scenario.fixedSources=[{sourceId:'uncertain',claimPercent:100}];
 const unscoped=run(f);
 expect(unscoped.issues).toContainEqual(expect.objectContaining({sourceId:'uncertain',resourceIds:[],blocksProjection:true}));
 expect(unscoped.rows.find(r=>r.resource.id==='paper')).toMatchObject({dailySupply:null,supplyIncomplete:true,status:'unknown'});
 expect(unscoped.rows.find(r=>r.resource.id==='member-exp')).toMatchObject({
   shortage:999,knownDailySupply:0,dailySupply:null,supplyIncomplete:true,clearanceDays:null,status:'unknown'});
 // A specified resource remains scoped; direct-only uncertainties must not block inventory.
 f.supply.fixedSources[0]!.rewards.unavailable=[{reason:'紙のみ不明',resourceIds:['paper']}];
 const scoped=run(f);
 expect(scoped.rows.find(r=>r.resource.id==='paper')).toMatchObject({dailySupply:null,status:'unknown'});
 expect(scoped.rows.find(r=>r.resource.id==='member-exp')).toMatchObject({dailySupply:0,supplyIncomplete:false,status:'unreachable'});
 f.supply.fixedSources[0]!.rewards.unavailable=[{reason:'直接付与のみ不明',resourceIds:[],destination:'direct'}];
 const direct=run(f);
 expect(direct.rows.find(r=>r.resource.id==='member-exp')).toMatchObject({dailySupply:0,supplyIncomplete:false,status:'unreachable'});
});
it('rounds collection rewards before daily averaging and never invents a partial end collection',()=>{
 const f=economyFixture();f.scenario.includeEvents=false;
 Object.assign(f.scenario.studio,{enabled:true,levels:[{bandId:8101,level:8}],minutesPerDay:25,claimEveryMinutes:120});
 // Each full 120-minute collection: floor(3 * 10 * 7/4) = 52, at 25/120 collections/day.
 expect(paper(f).confirmedDaily).toBeCloseTo(52*25/120);
 f.scenario.studio.minutesPerDay=50;expect(paper(f).confirmedDaily).toBeCloseTo(52*50/120);
 f.scenario.studio.minutesPerDay=0;expect(paper(f).dailySupply).toBe(0);
});
it('uses exact rational supply for ceil, including fractional lottery expectations',()=>{
 const f=economyFixture();f.requirements.totals=[{resourceId:'paper',quantity:7}];f.scenario.includeEvents=false;
 f.supply.fixedSources=[{id:'fractional',name:'架空の抽選',basis:'独立の検算',intervalDays:{numerator:1,denominator:1},rewards:{...reward(),lotteries:[{draws:{numerator:1,denominator:1},totalWeight:100,outcomes:[{weight:7,rewards:[grant('paper',1)]},{weight:93,rewards:[]}]}]}}];
 f.scenario.fixedSources=[{sourceId:'fractional',claimPercent:100}];
 expect(paper(f)).toMatchObject({confirmedDaily:0,expectedDaily:.07,clearanceDays:100});
});
it('rejects old temporal and paid contracts rather than reinterpreting them',async()=>{
 const {importCatalog,exportCatalog}=await import('../../src/data/catalog/validate');const f=economyFixture();
 expect(importCatalog(exportCatalog(f.m))).toEqual(f.m);expect(importEconomyScenario(exportEconomyScenario(f.scenario))).toEqual(f.scenario);
 for(const schemaVersion of [1,2,3,4])expect(()=>importEconomyScenario(JSON.stringify({...f.scenario,schemaVersion}))).toThrow();
 for(const extras of [{startDate:'2024-01-01'},{dailyClaims:1},{pass:null},{purchases:[]}])expect(()=>importEconomyScenario(JSON.stringify({...f.scenario,...extras}))).toThrow();
 for(const extras of [{utcOffsetMinutes:0},{passes:[]},{offers:[]}])expect(()=>validateSupplyDefinition({...f.supply,...extras})).toThrow();
 expect(()=>validateSupplyDefinition({...f.supply,standardEvent:{...f.supply.standardEvent,unlimited:[]}})).toThrow();
 expect(()=>validateSupplyDefinition({...f.supply,fixedSources:[{id:'limited',name:'期間限定',basis:'拒否対象',intervalDays:{numerator:1,denominator:1},window:{startsAt:'2024-01-01T00:00:00Z',endsAt:'2024-01-02T00:00:00Z'},rewards:reward()}]})).toThrow();
 const {default:Ajv}=await import('ajv/dist/2020');const {readFileSync}=await import('node:fs');const ajv=new Ajv({strict:false});
 const catalog=ajv.compile(JSON.parse(readFileSync('public/schemas/catalog-v1.schema.json','utf8'))),scenario=ajv.compile(JSON.parse(readFileSync('public/schemas/economy-scenario-v5.schema.json','utf8')));
 expect(catalog(f.m)).toBe(true);expect(scenario(f.scenario)).toBe(true);expect(scenario({...f.scenario,endDate:'2024-01-01'})).toBe(false);
 expect(catalog({...f.m,supplyDefinition:{...f.supply,passes:[]}})).toBe(false);
});
it('protects old period-scenario bytes until explicit recovery',()=>{
 const f=economyFixture();const legacy='{"schemaVersion":4,"startDate":"2024-01-01"}';
 const map=new Map([['atsudori-tools.economy-scenario.v4',legacy]]);const store=createEconomyStore({getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);}},f.scenario);
 expect(store.protected()).toBe(true);expect(store.original()).toBe(legacy);expect(()=>store.update(f.scenario)).toThrow();expect(map.has(ECONOMY_STORAGE_KEY)).toBe(false);
 store.update(f.scenario,true,true);expect(map.get('atsudori-tools.economy-scenario.v4')).toBe(legacy);expect(store.protected()).toBe(false);
});
