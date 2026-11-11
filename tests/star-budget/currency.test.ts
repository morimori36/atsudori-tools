import { expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import { currencyBudget, measure as m } from '../helpers/currency-budget';
import { calculateStarBudget } from '../../src/domain/star-budget/calculate';
import { validateStarBudget, unknownBudgetValue } from '../../src/domain/star-budget/validate';
import { starBudgetDefinitionSchema } from '../../src/domain/star-budget/schema';
import { syntheticCatalog } from '../helpers/synthetic';
import { exportCatalog, importCatalog } from '../../src/data/catalog/validate';

it.each([[60,30,40,70],[110,0,20,20],[150,0,-20,-20],[130,0,0,0],[90,0,40,40],[0,90,40,130]])('allocates free first at expense %i', (e,f,p,t) => {
  const input=currencyBudget(e), before=structuredClone(input), c=calculateStarBudget(input).comparisons[0]!;
  expect([c.freeSupply.value,c.paidSupply.value]).toEqual([90,40]);
  expect([c.freeBalance.value,c.paidBalance.value,c.balance.value]).toEqual([f,p,t]);
  expect(input).toEqual(before);
});
it('separates purchase and daily pass supply without rounding and respects Premium/story switches', () => {
  const input=currencyBudget(),d=input.definition,s=d.currencyBreakdown!.sources;
  d.event.missionPremium=m(18); s['event.missionPremium']={free:m(11),paid:m(7)};
  d.event.storyPerEpisode=m(3);s['event.storyPerEpisode']={free:m(1),paid:m(2)};
  input.scenario.storyEventPercent=50;
  const before=calculateStarBudget(input);
  expect(before.comparisons.map(c=>c.freeSupply.value)).toEqual([91,98,105,112]);
  expect(before.comparisons.map(c=>c.paidSupply.value)).toEqual([42,55,68,81]);
  input.scenario.eventPremium=true;
  const r=calculateStarBudget(input);
  r.comparisons.forEach((c,i)=>{expect(c.freeSupply.value).toBe(before.comparisons[i]!.freeSupply.value!+11);expect(c.paidSupply.value).toBe(before.comparisons[i]!.paidSupply.value!+7);expect(c.freeSupply.value!+c.paidSupply.value!).toBe(c.totalSupply.value);expect(c.freeBalance.value!+c.paidBalance.value!).toBe(c.balance.value);});
  d.passes.lite.periodDays=m(3);
  expect(calculateStarBudget(input).comparisons[1]!.paidSupply.value).toBeCloseTo(49+13*7/3);
});
it('retains old totals with unknown or missing breakdown and never infers missing components', () => {
  const input=currencyBudget();input.definition.currencyBreakdown!.sources.liveStampWeekly.free=unknownBudgetValue();
  let c=calculateStarBudget(input).comparisons[0]!;
  expect(c.balance.value).toBe(70);expect(c.freeSupply.value).toBeNull();expect(c.freeSupply.knownSubtotal).toBe(0);expect(c.paidSupply.value).toBe(40);expect(c.freeBalance.value).toBeNull();expect(c.paidBalance.value).toBeNull();
  delete input.definition.currencyBreakdown;
  c=calculateStarBudget(input).comparisons[0]!;expect(c.totalSupply.value).toBe(130);expect(c.balance.value).toBe(70);expect(c.paidSupply.value).toBeNull();
});
it('keeps restricted/unknown cost balances pending, but excludes disabled unknown rewards', () => {
  const input=currencyBudget();input.definition.currencyBreakdown!.sources['event.missionPremium']={free:unknownBudgetValue(),paid:unknownBudgetValue()};
  expect(calculateStarBudget(input).comparisons[0]!.freeBalance.value).toBe(30);
  input.scenario.eventPremium=true;expect(calculateStarBudget(input).comparisons[0]!.freeBalance.value).toBeNull();
  input.scenario.eventPremium=false;input.definition.starCompatibility='restricted';expect(calculateStarBudget(input).comparisons[0]!.paidBalance.value).toBeNull();
  input.definition.starCompatibility='confirmed-usable'; input.scenario.rank=null;expect(calculateStarBudget(input).comparisons[0]!.freeBalance.value).toBeNull();
  input.scenario.selectedProducts=[];expect(calculateStarBudget(input).comparisons[0]!.freeBalance.value).toBe(90);
});
it('round trips the additive catalog contract and rejects malformed or inconsistent splits', () => {
  const input=currencyBudget(), master=syntheticCatalog(); master.starBudgetDefinition={...input.definition,revision:master.revision};
  expect(importCatalog(exportCatalog(master))).toEqual(master);
  const schema=new Ajv({strict:true,multipleOfPrecision:10}).compile(starBudgetDefinitionSchema);
  expect(schema(input.definition)).toBe(true);
  for(const mutate of [
    (x:typeof input)=>{x.definition.currencyBreakdown!.sources.liveStampWeekly.paid=m(1);},
    (x:typeof input)=>{x.definition.currencyBreakdown!.sources.liveStampWeekly.free=m(91);},
    (x:typeof input)=>{x.definition.liveStampWeekly=unknownBudgetValue();},
    (x:typeof input)=>{x.definition.currencyBreakdown!.sources.liveStampWeekly.free=m(-1);},
    (x:typeof input)=>{x.definition.currencyBreakdown!.sources.liveStampWeekly.free=m(1.5);},
    (x:typeof input)=>{Object.assign(x.definition.currencyBreakdown!,{version:2});},
    (x:typeof input)=>{Object.assign(x.definition.currencyBreakdown!,{paymentPriority:'paid-first'});},
    (x:typeof input)=>{x.definition.currencyBreakdown!.basis=' ';},
    (x:typeof input)=>{Reflect.deleteProperty(x.definition.currencyBreakdown!.sources,'loginDaily');},
    (x:typeof input)=>{Object.assign(x.definition.currencyBreakdown!.sources,{unknown:{free:m(0),paid:m(0)}});},
  ]) {const copy=structuredClone(input);mutate(copy);expect(()=>validateStarBudget(copy)).toThrow();}
});
