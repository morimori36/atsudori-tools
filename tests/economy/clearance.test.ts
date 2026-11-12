import {it,expect} from 'vitest';
import {economyFixture,grant,reward} from '../helpers/economy';
import {calculateEconomy} from '../../src/domain/economy/calculate';
import {validateSupplyDefinition} from '../../src/domain/economy/validate';
const run=(f:ReturnType<typeof economyFixture>)=>calculateEconomy(f.m,f.c,f.requirements);
const paper=(f:ReturnType<typeof economyFixture>)=>run(f).rows.find(x=>x.resource.id==='paper')!;
it('uses the common ten-day continuous-event assumption regardless of supplied cadence',()=>{
 const f=economyFixture(),before=JSON.stringify(f);expect(paper(f)).toMatchObject({eventDaily:3,dailySupply:3,clearanceDays:667,status:'estimated'});
 expect(JSON.stringify(f)).toBe(before);f.supply.standardEvent!.intervalDays=8;expect(paper(f).eventDaily).toBe(3);
});
it('distinguishes zero supply, fulfilled, unknown stock and incomplete demand',()=>{
 const f=economyFixture();f.supply.standardEvent!.cumulative=reward();f.supply.standardEvent!.limited=reward();
 expect(paper(f)).toMatchObject({dailySupply:0,shortage:2000,clearanceDays:null,status:'unreachable'});
 f.c.resourceInventory!.paper=2200;expect(paper(f)).toMatchObject({shortage:0,clearanceDays:0,status:'fulfilled'});
 delete f.c.resourceInventory!.paper;expect(paper(f)).toMatchObject({stock:null,shortage:null,status:'unknown'});
 f.c.resourceInventory!.paper=0;f.requirements.incomplete=true;expect(paper(f)).toMatchObject({required:null,requiredSubtotal:2000,shortage:null,status:'unknown'});
});
it('keeps unknown supply scoped and preserves known subtotals',()=>{
 const f=economyFixture();f.supply.standardEvent!.limited.unavailable=[{reason:'未確認報酬',resourceIds:['paper']}];
 expect(paper(f)).toMatchObject({dailySupply:null,knownDailySupply:3,status:'unknown'});
 f.supply.standardEvent=null;expect(paper(f).dailySupply).toBeNull();
 f.c.resourceInventory!.paper=2000;expect(paper(f).clearanceDays).toBe(0);
 delete f.m.supplyDefinition;expect(paper(f).clearanceDays).toBe(0);
});
it('uses exact rational lottery expectations when computing ceil',()=>{
 const f=economyFixture();f.supply.standardEvent!.cumulative=reward();f.supply.standardEvent!.limited=reward();f.requirements.totals=[{resourceId:'paper',quantity:7}];
 const s=f.supply.fixedSources.find(s=>s.id==='season-pass-free')!;s.intervalDays={numerator:1,denominator:1};
 s.rewards={...reward(),lotteries:[{draws:{numerator:1,denominator:1},totalWeight:100,outcomes:[{weight:7,rewards:[grant('paper',1)]},{weight:93,rewards:[]}]}]};
 expect(paper(f)).toMatchObject({expectedDaily:.07,clearanceDays:100});
});
it('keeps the existing supply contract and rejects unsupported extensions',async()=>{
 const f=economyFixture();const {importCatalog,exportCatalog}=await import('../../src/data/catalog/validate');
 expect(importCatalog(exportCatalog(f.m))).toEqual(f.m);
 expect(()=>validateSupplyDefinition({...f.supply,offers:[]})).toThrow();
 expect(()=>validateSupplyDefinition({...f.supply,standardEvent:{...f.supply.standardEvent,unlimited:[]}})).toThrow();
});
