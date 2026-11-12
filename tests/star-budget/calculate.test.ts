import { expect, it } from 'vitest';
import { calculateStarBudget } from '../../src/domain/star-budget/calculate';
import { emptyStarBudget, unknownBudgetValue } from '../../src/domain/star-budget/validate';
import { assumedBudgetValue as m, starBudgetFixture } from '../helpers/star-budget';

it('reproduces the hypothetical weekly acceptance totals without rounding intermediate periods', () => {
  const input = starBudgetFixture(), before = structuredClone(input), r = calculateStarBudget(input);
  expect(r.weeklyCost.value).toBe(2190);
  expect(r.commonSupply.value).toBeCloseTo(7897 / 6, 10);
  expect(r.comparisons.map(c => c.grade)).toEqual(['none', 'lite', 'standard', 'premium']);
  expect(r.comparisons.map(c => c.passSupply.value)).toEqual([0, 700 * 7 / 30, 490, 980]);
  const premium = r.comparisons[3]!;
  expect(premium.totalSupply.value).toBeCloseTo(13777 / 6, 10);
  expect(premium.balance.value).toBeCloseTo(637 / 6, 10);
  expect(premium.status).toBe('surplus');
  expect(r.comparisons[0]!.status).toBe('shortfall');
  expect(premium.yenPer30Days.value).toBe(789);
  expect(input).toEqual(before);
});

it('changes exactly the selected band, locked SP product, stories, and premium reward', () => {
  const input = starBudgetFixture();
  const premium = () => calculateStarBudget(input).comparisons[3]!;
  const baseline = premium().balance.value!;
  input.scenario.selectedProducts = input.scenario.selectedProducts.filter(id => id !== 'sr-1');
  expect(premium().balance.value! - baseline).toBeCloseTo(290, 10);
  input.scenario.selectedProducts.push('sr-1'); input.scenario.rank = 12;
  expect(calculateStarBudget(input).weeklyCost.value).toBe(1950);
  expect(calculateStarBudget(input).products.find(p => p.id === 'skill-sp')!.availability).toBe('locked');
  input.scenario.rank = 13; input.scenario.storyEventPercent = 0;
  expect(baseline - premium().balance.value!).toBeCloseTo(157.5, 10);
  input.scenario.storyEventPercent = 50;
  expect(baseline - premium().balance.value!).toBeCloseTo(78.75, 10);
  input.scenario.storyEventPercent = 100; input.scenario.seasonPremium = false;
  expect(baseline - premium().balance.value!).toBeCloseTo(420, 10);
  input.scenario.seasonPremium = true; input.scenario.eventPremium = true;
  expect(premium().balance.value).toBeCloseTo(baseline, 10);
});

it('preserves unknowns and known subtotals, and excludes unavailable prices when locked or off', () => {
  const input = starBudgetFixture(); input.definition.loginDaily = unknownBudgetValue();
  let r = calculateStarBudget(input);
  expect(r.commonSupply.value).toBeNull(); expect(r.commonSupply.knownSubtotal).toBeCloseTo(7057 / 6, 10);
  expect(r.comparisons[3]!.balance.value).toBeNull(); expect(r.comparisons[3]!.status).toBe('unknown');
  input.definition.loginDaily = m(0);
  expect(calculateStarBudget(input).commonSupply.value).toBeCloseTo(7057 / 6, 10);
  const sp = input.definition.products.find(p => p.id === 'skill-sp')!;
  sp.tiers[0]!.starCost = unknownBudgetValue();
  expect(calculateStarBudget(input).weeklyCost.value).toBeNull();
  input.scenario.rank = 12;
  expect(calculateStarBudget(input).weeklyCost.value).toBe(1950);
  input.scenario.rank = null; input.scenario.selectedProducts = [];
  expect(calculateStarBudget(input).weeklyCost.value).toBe(0);
  input.scenario.selectedProducts = ['skill-sp'];
  r = calculateStarBudget(input); expect(r.weeklyCost.value).toBeNull(); expect(r.weeklyCost.reasons[0]).toContain('解放条件');
});

it('does not require disabled premium, story or arena quantities and distinguishes a confirmed zero', () => {
  const input = starBudgetFixture(); input.scenario.storyEventPercent = 0; input.scenario.seasonPremium = false;
  input.definition.event.storyEpisodes = unknownBudgetValue(); input.definition.event.storyPerEpisode = unknownBudgetValue();
  input.definition.event.missionPremium = unknownBudgetValue(); input.definition.season.premium = unknownBudgetValue();
  expect(calculateStarBudget(input).commonSupply.value).not.toBeNull();
  input.scenario.eventPremium = true;
  expect(calculateStarBudget(input).commonSupply.value).toBeNull();
  input.definition.event.missionPremium = { value: 0, status: 'confirmed', basis: '人工ケースの定義で追加なしと明示' };
  expect(calculateStarBudget(input).commonSupply.value).not.toBeNull();

});

it('requires the stamp choice and star usability, with yen separate from star income', () => {
  const input = starBudgetFixture(); input.definition.liveStampSelection = '';
  expect(calculateStarBudget(input).commonSupply.value).toBeNull();
  input.definition.liveStampSelection = '人工ケースの選択';
  const before = calculateStarBudget(input);
  input.definition.passes.premium.priceYen = unknownBudgetValue();
  const after = calculateStarBudget(input);
  expect(after.comparisons[3]!.balance.value).toBe(before.comparisons[3]!.balance.value);
  expect(after.comparisons[3]!.yenPer30Days.value).toBeNull();
  input.definition.starCompatibility = 'unconfirmed';
  expect(calculateStarBudget(input).comparisons.every(c => c.balance.value === null)).toBe(true);
  input.definition.starCompatibility = 'restricted'; input.definition.starCompatibilityBasis = '人工的な利用制約';
  expect(calculateStarBudget(input).comparisons[3]!.status).toBe('unknown');
});

it('uses ten-day events while retaining independently configured pass renewal periods', () => {
  const input = starBudgetFixture(); input.definition.event.intervalDays = m(12.5);
  input.definition.passes.premium.periodDays = m(28);
  const r = calculateStarBudget(input);
  expect(r.supply.find(s => s.id === 'event-points')!.value).toBe(252);
  expect(r.comparisons[3]!.passSupply.value).toBe(990); // 600*7/28 + 120*7
  expect(r.comparisons[3]!.yenPer30Days.value).toBeCloseTo(789 * 30 / 28, 10);
});

it('uses exact signs at zero and rejects unsafe aggregate costs', () => {
  const input = starBudgetFixture();
  input.definition.loginDaily = m(0); input.definition.missionDaily = m(0); input.definition.liveStampWeekly = m(7);
  input.definition.event.points = m(0); input.definition.event.missionFree = m(0); input.scenario.storyEventPercent = 0;
  input.definition.season.free = m(0); input.scenario.seasonPremium = false;
  input.scenario.selectedProducts = ['skill-basic'];
  const p = input.definition.products.find(p => p.id === 'skill-basic')!; p.tiers = [{ starCost: m(7), weeklyLimit: m(1) }];
  expect(calculateStarBudget(input).comparisons[0]!.status).toBe('balanced');
  p.tiers[0]!.starCost = m(Number.MAX_SAFE_INTEGER); p.tiers[0]!.weeklyLimit = m(2);
  expect(() => calculateStarBudget(input)).toThrow('安全な数値範囲');
});

it('starts with unknown game definitions, including all four comparisons', () => {
  const input = emptyStarBudget(), r = calculateStarBudget(input);
  expect(r.comparisons).toHaveLength(4);
  expect(r.commonSupply.value).toBeNull(); expect(r.weeklyCost.value).toBeNull();
  expect(r.comparisons.every(c => c.balance.value === null)).toBe(true);
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if ('value' in value) expect(value.value).toBeNull();
    Object.values(value).forEach(walk);
  };
  walk(input.definition);
});


it.each([false, true])('ignores legacy arena=%s for unknown, zero and positive definitions without mutating inputs', includeArena => {
  const input = starBudgetFixture();
  Object.assign(input.scenario, { includeArena });
  const baseline = calculateStarBudget(input);
  for (const quantity of [unknownBudgetValue(), { value: 0, status: 'confirmed' as const, basis: '人工ケースのゼロ' }, m(51)]) {
    const arena = { recurringStars: quantity, intervalDays: unknownBudgetValue() };
    Object.assign(input.definition, { arena });
    const before = structuredClone(input);
    expect(calculateStarBudget(input)).toEqual(baseline);
    expect(input).toEqual(before);
    arena.intervalDays = m(17);
    expect(calculateStarBudget(input)).toEqual(baseline);
  }
  expect(baseline.supply.some(row => row.id === 'arena')).toBe(false);
  expect(baseline.commonSupply.value).toBeCloseTo(7897 / 6, 10);
});
