import {expect, it} from 'vitest';
import Ajv from 'ajv/dist/2020';
import {readFileSync} from 'node:fs';
import {budgetPlanFixture, selectPlan} from '../helpers/budget-plan';
import {calculateCollectionBudgetPlan} from '../../src/app/seal-budget';
import {calculateStarBudget} from '../../src/domain/star-budget/calculate';
import {defaultStarBudgetScenario} from '../../src/domain/star-budget/model';
import {emptyStarBudget, unknownBudgetValue} from '../../src/domain/star-budget/validate';
import {importCatalog, exportCatalog} from '../../src/data/catalog/validate';
import {exportCollection, importCollection} from '../../src/storage/collection';
import {prepareCollectionImport} from '../../src/storage/collection-import';
import {sealDefinition} from '../helpers/seal-budget';

const run = (f: ReturnType<typeof budgetPlanFixture>) => calculateCollectionBudgetPlan(f.master, f.collection);
const plans = ['none', 'lite', 'standard', 'premium'] as const;
const schema = (name: string) => new Ajv({strict: true, multipleOfPrecision: 10})
  .compile(JSON.parse(readFileSync(`public/schemas/${name}-v1.schema.json`, 'utf8')));

it.each(plans)('counts only %s pass supply once and uses its actual free gacha schedule', plan => {
  const f = selectPlan(budgetPlanFixture(), plan), i = plans.indexOf(plan);
  f.collection.sealBudgetScenario!.pass = true;
  const before = structuredClone(f), r = run(f);
  expect(r.stars!.income).toBeCloseTo((3900 + 600 * i) / 7);
  expect(r.stars!.exchange).toBeCloseTo(1800 / 7);
  expect(r.stars!.gachaExpense).toBe(0);
  expect(r.stars!.paidIncome).toBeCloseTo((1200 + 390 * i) / 7);
  expect(r.stars!.freeIncome).toBeCloseTo(2700 / 7 + 30 * i);
  expect(r.seals.totalIncome).toBeCloseTo(i ? 8 * (i + 1) * 30 / 9 : 0);
  expect(r.status).toBe('sustainable');
  const weekly = calculateStarBudget({definition: f.master.starBudgetDefinition!,
    scenario: {...f.collection.starBudgetScenario!, rank: 1}}).comparisons[i]!;
  expect(r.stars!.income).toBeCloseTo(weekly.totalSupply.value! * 30 / 7);
  expect(r.stars!.balance).toBeCloseTo(weekly.balance.value! * 30 / 7);
  expect(f).toEqual(before);
});

for (const plan of plans) for (const paid of [0, 1, 2] as const) for (const event of [0, 1, 2] as const) {
  it(`${plan}: shares paid=${paid}, event=${event} counts across seal income and paid-only cost`, () => {
    const f = selectPlan(budgetPlanFixture(), plan), limits = f.definition.planBenefits![plan];
    f.collection.sealBudgetScenario = {cm: false, pass: false, paid, event, selectedProducts: []};
    const p = Math.min(paid, limits.paidDailyLimit!), e = Math.min(event, limits.eventDailyLimit!);
    const r = run(f);
    expect(r.seals.totalIncome).toBeCloseTo(240 * p + 30 * (2.99999 + 14) * e);
    expect(r.stars!.gachaExpense).toBe(240 * (p + e));
    expect(r.unavailable).toBe(p !== paid || e !== event);
    if (r.unavailable) expect(r.status).toBe('unavailable');
  });
}

it('CM-only has no star cost; seal exchange and catalog exchange stay independent', () => {
  const f = budgetPlanFixture();
  f.collection.sealBudgetScenario!.cm = true;
  f.collection.sealBudgetScenario!.selectedProducts = ['fictional-paper'];
  const on = run(f);
  expect(on.seals).toMatchObject({totalIncome: 2640, totalExpense: 67, balance: 2573});
  expect(on.stars).toMatchObject({gachaExpense: 0, balance: 300});
  f.collection.starBudgetScenario!.selectedProducts = [];
  const off = run(f);
  expect(off.stars!.exchange).toBe(0);
  expect(off.stars!.balance).toBeCloseTo(3900 / 7);
  expect(off.seals).toEqual(on.seals);
  f.collection.sealBudgetScenario!.selectedProducts = [];
  expect(run(f).seals.totalExpense).toBe(0);
});

it('rejects feasibility with positive total balance but insufficient paid stars', () => {
  const f = budgetPlanFixture();
  f.collection.sealBudgetScenario!.paid = 1;
  const r = run(f);
  expect(r.stars).toMatchObject({balance: 60, gachaExpense: 240});
  expect(r.stars!.paidBalance).toBeCloseTo(-480 / 7);
  expect(r.stars!.freeBalance).toBeCloseTo(900 / 7);
  expect(r.status).toBe('paid-shortfall');
});

it.each([110, 130, 150])('keeps free-first exchange allocation and exact zero at weekly cost %s', cost => {
  const r = run(budgetPlanFixture(cost));
  expect(r.stars!.freeBalance).toBe(0);
  expect(r.stars!.paidExchange).toBeCloseTo((cost - 90) * 30 / 7);
  expect(r.stars!.balance).toBeCloseTo((130 - cost) * 30 / 7);
  expect(r.stars!.paidBalance).toBeCloseTo((130 - cost) * 30 / 7);
  expect(r.status).toBe(cost > 130 ? 'shortfall' : 'sustainable');
  if (cost === 130) expect(r.stars!.balance).toBe(0);
});

it('exactly balances a fractional gacha period without a floating-point shortfall', () => {
  const f = budgetPlanFixture(130);
  f.collection.starBudgetScenario!.selectedProducts = [];
  f.collection.sealBudgetScenario!.paid = 1;
  const g = f.definition.gachas.find(g => g.id === 'paid')!;
  g.periodDays = 7; g.paidStarsPerDraw = 130;
  const r = run(f);
  expect(r.stars!.balance).toBe(0);
  expect(r.status).toBe('paid-shortfall'); // Total zero still cannot fund paid-only spending from free supply.
});

it('reuses Premium purchase flags, rank and exchange selections from the shared scenario', () => {
  const f = budgetPlanFixture(), d = f.master.starBudgetDefinition!;
  d.event.missionPremium = {value: 7, status: 'assumed', basis: '架空の追加供給'};
  d.currencyBreakdown!.sources['event.missionPremium'].free = d.event.missionPremium;
  const before = run(f).stars!.income;
  f.collection.starBudgetScenario!.eventPremium = true;
  expect(run(f).stars!.income - before).toBeCloseTo(21);
  d.products[0]!.unlockRank.value = 2;
  expect(run(f).stars!.exchange).toBe(0);
  f.collection.tgwRank = 2;
  expect(run(f).stars!.exchange).toBeCloseTo(1800 / 7);
});

it('displays known contributions for missing benefits, currency and costs without changing nulls', () => {
  const f = selectPlan(budgetPlanFixture(), 'premium');
  f.collection.sealBudgetScenario = {cm: true, pass: true, paid: 1, event: 1, selectedProducts: []};
  f.definition.planBenefits!.premium.passGachas = null;
  f.definition.planBenefits!.premium.eventDailyLimit = null;
  f.master.starBudgetDefinition!.loginDaily = unknownBudgetValue();
  const c = f.master.starBudgetDefinition!.currencyBreakdown!;
  c.sources.loginDaily.free = unknownBudgetValue(); c.sources.loginDaily.paid = unknownBudgetValue();
  f.definition.gachas.find(g => g.id === 'paid')!.paidStarsPerDraw = null;
  const before = structuredClone(f), r = run(f);
  expect(r.seals.totalIncome).toBe(2880);
  expect(r.stars!.income).toBeCloseTo(5700 / 7);
  expect(r.stars!.gachaExpense).toBe(0);
  expect(r.notes.length).toBeGreaterThan(0);
  expect(r.status).toBe('unconfirmed');
  expect(f).toEqual(before);
  delete f.master.starBudgetDefinition!.currencyBreakdown;
  expect(run(f).stars!.paidIncome).toBe(0);
  delete f.master.starBudgetDefinition;
  expect(run(f).stars).toBeNull();
});

it('returns numeric zero for an all-unknown integrated budget without overwriting unknowns', () => {
  const f = budgetPlanFixture();
  f.master.starBudgetDefinition = {...emptyStarBudget().definition, revision: f.master.revision};
  delete f.definition.planBenefits;
  f.collection.sealBudgetScenario!.paid = 1;
  const before = structuredClone(f), r = run(f);
  expect(r.seals.totalIncome).toBe(0);
  expect(r.stars).toMatchObject({income: 0, exchange: 0, gachaExpense: 0, balance: 0, paidBalance: 0});
  expect(r.status).toBe('unconfirmed');
  expect(f).toEqual(before);
});

it('keeps known free entitlements when another free entitlement has an unknown period', () => {
  const f = selectPlan(budgetPlanFixture(), 'premium');
  f.collection.sealBudgetScenario!.pass = true;
  f.collection.sealBudgetScenario!.eventFree = true;
  f.definition.planBenefits!.premium.passGachas![1]!.periodDays = null;
  expect(schema('catalog')(f.master)).toBe(true);
  const before = structuredClone(f), r = run(f);
  expect(r.seals.totalIncome).toBeCloseTo(8 * 4 * 30 / 9);
  expect(r.stars!.gachaExpense).toBe(0);
  expect(r.notes).toContain('パス付属ガチャの回数・条件は未確認のため除外');
  expect(r.status).toBe('unconfirmed');
  expect(f).toEqual(before);
});

it('retains known numbers while honoring catalog payment restrictions', () => {
  const f = budgetPlanFixture();
  f.master.starBudgetDefinition!.starCompatibility = 'restricted';
  expect(run(f).stars!.balance).toBe(300);
  expect(run(f).status).toBe('unconfirmed');
});

it('uses the referenced gacha pool for plan benefits but awards no Pt for free draws', () => {
  const f = selectPlan(budgetPlanFixture(), 'lite');
  const definition = sealDefinition();
  definition.revision = f.master.revision;
  definition.planBenefits!.lite.passGachas = [{gachaId: 'pass', draws: 2, periodDays: 9, poolId: 'ordinary'}];
  definition.gachas.find(g => g.id === 'pass')!.pointsPerDraw = 2;
  f.master.sealBudgetDefinition = definition;
  f.collection.sealBudgetScenario!.pass = true;
  const r = run(f);
  const row = r.seals.income.find(g => g.id === 'pass')!;
  expect(row.draws).toBeCloseTo(2 * 30 / 9);
  expect(row.member).toBeCloseTo(2 * 2 * 30 / 9);
  expect(row.snap).toBeCloseTo(6 * 2 * 30 / 9);
  expect(row.points).toBe(0);
  expect(r.seals.totalIncome).toBeCloseTo(8 * 2 * 30 / 9);
  expect(r.stars!.gachaExpense).toBe(0);
});

it('awards no Pt for free pass and free event draws while paid event draws keep Pt income', () => {
  const f = selectPlan(budgetPlanFixture(), 'premium');
  f.collection.sealBudgetScenario = {cm: false, pass: true, eventFree: true, paid: 0, event: 1, selectedProducts: []};
  const r = run(f);
  const pass = r.seals.income.find(g => g.id === 'pass')!;
  expect(pass.draws).toBeCloseTo(4 * 30 / 9);
  expect(pass.member).toBeCloseTo(2 * 4 * 30 / 9);
  expect(pass.snap).toBeCloseTo(6 * 4 * 30 / 9);
  expect(pass.points).toBe(0);
  const event = r.seals.income.find(g => g.id === 'event')!;
  expect(event.draws).toBeCloseTo(30 + 30 / 4);
  expect(event.member).toBeCloseTo(30 * 1.00001 + 2 * 30 / 4);
  expect(event.snap).toBeCloseTo(30 * 1.99998 + 6 * 30 / 4);
  expect(event.points).toBeCloseTo(30 * 2 * 7);
  expect(event.total).toBeCloseTo(event.member + event.snap + event.points);
  expect(r.seals.totalIncome).toBeCloseTo(pass.total + event.total);
});

it.each([[false, false], [true, false], [false, true], [true, true]] as const)('selects Premium pass=%s and eventFree=%s independently', (pass, eventFree) => {
  const f = selectPlan(budgetPlanFixture(), 'premium');
  f.collection.sealBudgetScenario = {cm: false, pass, eventFree, paid: 0, event: 0, selectedProducts: []};
  const r = run(f);
  expect(r.seals.totalIncome).toBeCloseTo((pass ? 8 * 4 * 30 / 9 : 0) + (eventFree ? 8 * 30 / 4 : 0));
  expect(r.freeBenefits.map(row => row.gachaId)).toEqual([...(pass ? ['pass' as const] : []), ...(eventFree ? ['event' as const] : [])]);
  expect(r.freeBenefits.every(row => row.points === 0)).toBe(true);
  expect(r.stars!.gachaExpense).toBe(0);
});

it('preserves an omitted eventFree through export while calculating it as OFF', () => {
  const f = selectPlan(budgetPlanFixture(), 'premium');
  delete f.collection.sealBudgetScenario!.eventFree;
  f.collection.sealBudgetScenario!.pass = true;
  expect(run(f).freeBenefits.map(row => row.gachaId)).toEqual(['pass']);
  expect(importCollection(exportCollection(f.collection, f.master), f.master).sealBudgetScenario).not.toHaveProperty('eventFree');
});

it.each([0, 1, 'true', null])('rejects non-boolean eventFree %s', value => {
  const f = budgetPlanFixture(); Object.assign(f.collection.sealBudgetScenario!, {eventFree: value});
  expect(schema('collection')(f.collection)).toBe(false);
  expect(() => run(f)).toThrow();
});

it('throws on invalid star costs and unsafe arithmetic rather than excluding them as unknown', () => {
  const f = budgetPlanFixture();
  f.collection.sealBudgetScenario!.paid = 1;
  const g = f.definition.gachas.find(g => g.id === 'paid')!;
  g.paidStarsPerDraw = -1;
  expect(() => run(f)).toThrow();
  g.paidStarsPerDraw = 1e9; g.draws = 1e9; g.periodDays = 0.01;
  expect(() => run(f)).toThrow(/範囲/);
});

it('preserves old collections, explicit plan choices and benefits through schema, import and export', () => {
  const f = selectPlan(budgetPlanFixture(), 'standard');
  expect(schema('catalog')(f.master)).toBe(true);
  expect(schema('collection')(f.collection)).toBe(true);
  expect(importCatalog(exportCatalog(f.master))).toEqual(f.master);
  expect(importCollection(exportCollection(f.collection, f.master), f.master)).toEqual(f.collection);
  const omitted = {...f.collection}; delete omitted.starBudgetScenario;
  expect(prepareCollectionImport(omitted, f.collection, f.master).starBudgetScenario!.passPlan).toBe('standard');
  expect(prepareCollectionImport(omitted, f.collection, f.master, false).starBudgetScenario).toBeUndefined();
  expect(defaultStarBudgetScenario()).not.toHaveProperty('passPlan');
  delete f.definition.planBenefits;
  expect(importCatalog(exportCatalog(f.master)).sealBudgetDefinition).not.toHaveProperty('planBenefits');
});

it.each(['wrong-plan', null, 2])('rejects invalid saved plan %s', value => {
  const f = budgetPlanFixture(); Object.assign(f.collection.starBudgetScenario!, {passPlan: value});
  expect(schema('collection')(f.collection)).toBe(false);
  expect(() => run(f)).toThrow();
});

it.each(['limit', 'period', 'pool', 'basis', 'none-benefit', 'extra'])('rejects invalid benefits: %s', kind => {
  const f = budgetPlanFixture(), benefit = f.definition.planBenefits!.lite;
  if (kind === 'limit') Object.assign(benefit, {paidDailyLimit: 3});
  if (kind === 'period') benefit.passGachas![0]!.periodDays = 0;
  if (kind === 'pool') benefit.passGachas![0]!.poolId = 'missing';
  if (kind === 'basis') benefit.basis = ' ';
  if (kind === 'none-benefit') f.definition.planBenefits!.none.passGachas = benefit.passGachas;
  if (kind === 'extra') Object.assign(benefit, {extra: 1});
  expect(() => importCatalog(JSON.stringify(f.master))).toThrow();
});
