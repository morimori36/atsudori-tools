import {it,expect} from 'vitest';
import {economyFixture} from '../helpers/economy';
import {calculateEconomy} from '../../src/domain/economy/calculate';
for(const [days,count] of [[30,1],[31,2],[90,3],[365,13]])it(`renews for ${days} days without duplicating weekly rights`,()=>{
 const f=economyFixture();f.supply.passes[0]!.durationDays=30;f.scenario.pass={passId:'short-pass'};f.scenario.endDate=new Date(Date.parse(f.scenario.startDate)+(days!-1)*86400000).toISOString().slice(0,10);
 const r=calculateEconomy(f.m,f.c.resourceInventory!,f.requirements,f.scenario);
 expect(r.passContracts).toBe(count);expect(r.cashCostYen).toBe(count!*73);expect(r.rows.find(x=>x.resource.id==='tokens-a')!.passIncome).toBe(count!*17);expect(r.rows.find(x=>x.resource.id==='tokens-b')!.passIncome).toBe(days!*3);
 expect(r.entitlements.filter(x=>x.sourceName.includes('週次')).reduce((n,x)=>n+x.quantity,0)).toBe(Math.ceil(days!/7)*2);
 expect(r.entitlements.filter(x=>x.certainty==='estimated').reduce((n,x)=>n+x.quantity,0)).toBeCloseTo(days!*.7);
 f.scenario.pass=null;const no=calculateEconomy(f.m,f.c.resourceInventory!,f.requirements,f.scenario);expect(no.passContracts).toBe(0);expect(no.cashCostYen).toBe(0);
});
