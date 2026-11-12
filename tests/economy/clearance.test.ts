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
 delete f.c.resourceInventory!.paper;expect(paper(f)).toMatchObject({stock:null,shortage:2000,status:'unreachable'});
 f.c.resourceInventory!.paper=0;f.requirements.incomplete=true;expect(paper(f)).toMatchObject({required:2000,requiredSubtotal:2000,shortage:2000,status:'unreachable'});
});
it('keeps unknown supply scoped and preserves known subtotals',()=>{
 const f=economyFixture();f.supply.standardEvent!.limited.unavailable=[{reason:'未確認報酬',resourceIds:['paper']}];
 expect(paper(f)).toMatchObject({dailySupply:3,knownDailySupply:3,status:'estimated'});
 f.supply.standardEvent=null;expect(paper(f).dailySupply).toBe(0);
 f.c.resourceInventory!.paper=2000;expect(paper(f).clearanceDays).toBe(0);
 delete f.m.supplyDefinition;expect(paper(f).clearanceDays).toBe(0);
});
it('uses exact rational lottery expectations when computing ceil',()=>{
 const f=economyFixture();f.supply.standardEvent!.cumulative=reward();f.supply.standardEvent!.limited=reward();f.requirements.totals=[{resourceId:'paper',quantity:7}];
 const s=f.supply.fixedSources.find(s=>s.id==='season-pass-free')!;s.intervalDays={numerator:1,denominator:1};
 s.rewards={...reward(),lotteries:[{draws:{numerator:1,denominator:1},totalWeight:100,outcomes:[{weight:7,rewards:[grant('paper',1)]},{weight:93,rewards:[]}]}]};
 expect(paper(f)).toMatchObject({expectedDaily:.07,clearanceDays:100});
});
it('accepts the current supply contract and rejects unsupported extensions',async()=>{
 const f=economyFixture();const {importCatalog,exportCatalog}=await import('../../src/data/catalog/validate');
 expect(importCatalog(exportCatalog(f.m))).toEqual(f.m);
 expect(()=>validateSupplyDefinition({...f.supply,offers:[]})).toThrow();
 expect(()=>validateSupplyDefinition({...f.supply,standardEvent:{...f.supply.standardEvent,unlimited:[]}})).toThrow();
});

it('computes partial demand, unknown stock and unknown supply together without mutation',()=>{
 const f=economyFixture();f.requirements.incomplete=true;delete f.c.resourceInventory!.paper;
 f.supply.unavailable=[{reason:'架空未確認分',resourceIds:[]}];const before=JSON.stringify(f);
 expect(paper(f)).toMatchObject({required:2000,stock:null,shortage:2000,dailySupply:3,clearanceDays:667});
 expect(JSON.stringify(f)).toBe(before);
});
it('shows numerical zeros for wholly unknown inputs and rejects corrupted references',()=>{
 const f=economyFixture();f.requirements.incomplete=true;f.requirements.totals=[];f.c.resourceInventory={};delete f.m.supplyDefinition;
 expect(paper(f)).toMatchObject({required:0,stock:null,shortage:0,dailySupply:0,clearanceDays:0,status:'fulfilled'});
 f.m.supplyDefinition=f.supply;f.supply.unavailable.push({resourceIds:['missing-resource'],reason:'不正参照'});
 expect(()=>run(f)).toThrow('参照素材');
});

it('rejects v4 and retired studio fields rather than changing their meanings',()=>{
 const f=economyFixture();const before=JSON.stringify(f);
 expect(()=>validateSupplyDefinition({...f.supply,schemaVersion:4})).toThrow('再生成・再Import');
 for(const field of [{rounding:'tick'},{rounding:'claim'},{lotteryRounding:'fractional'},{lotteryRounding:'floor'},{overflowRate:null},{capMinutes:null}]){
  const d=structuredClone(f.supply);Object.assign(d.studios[0]!,field);expect(()=>validateSupplyDefinition(d)).toThrow();
 }
 for(const minutes of [0,13]){const d=structuredClone(f.supply);d.studios[0]!.normalMinutes=minutes;expect(()=>validateSupplyDefinition(d)).toThrow();}
 expect(JSON.stringify(f)).toBe(before);
});
