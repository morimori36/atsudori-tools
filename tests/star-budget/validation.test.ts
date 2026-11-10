import { expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import { starBudgetDefinitionSchema, starBudgetScenarioSchema } from '../../src/domain/star-budget/schema';
import { emptyStarBudget, validateStarBudget } from '../../src/domain/star-budget/validate';
import { starBudgetFixture } from '../helpers/star-budget';

it.each([
  ['fractional reward', (r: ReturnType<typeof starBudgetFixture>) => { r.definition.loginDaily.value = 2.5; }],
  ['unsafe reward', (r: ReturnType<typeof starBudgetFixture>) => { r.definition.loginDaily.value = Number.MAX_SAFE_INTEGER + 1; }],
  ['zero interval', (r: ReturnType<typeof starBudgetFixture>) => { r.definition.event.intervalDays.value = 0; }],
  ['excess precision', (r: ReturnType<typeof starBudgetFixture>) => { r.definition.event.intervalDays.value = 1.001; }],
  ['negative reward', (r: ReturnType<typeof starBudgetFixture>) => { r.definition.loginDaily.value = -1; }],
  ['missing evidence', (r: ReturnType<typeof starBudgetFixture>) => { r.definition.loginDaily.basis = ' '; }],
  ['unknown with value', (r: ReturnType<typeof starBudgetFixture>) => { r.definition.loginDaily.status = 'unconfirmed'; }],
  ['array evidence status', (r: ReturnType<typeof starBudgetFixture>) => { (r.definition.loginDaily as unknown as { status: unknown }).status = ['assumed']; }],
  ['array compatibility status', (r: ReturnType<typeof starBudgetFixture>) => { (r.definition as unknown as { starCompatibility: unknown }).starCompatibility = ['assumed-usable']; }],
  ['confirmed without value', (r: ReturnType<typeof starBudgetFixture>) => { r.definition.loginDaily.value = null; }],
  ['incomplete products', (r: ReturnType<typeof starBudgetFixture>) => { r.definition.products.pop(); }],
  ['duplicate product slot', (r: ReturnType<typeof starBudgetFixture>) => { r.definition.products[0]!.id = r.definition.products[1]!.id; }],
  ['ambiguous band names', (r: ReturnType<typeof starBudgetFixture>) => { r.definition.products[9]!.name = r.definition.products[10]!.name; }],
  ['duplicate selection', (r: ReturnType<typeof starBudgetFixture>) => { r.scenario.selectedProducts.push('sr-1'); }],
  ['out of range story ratio', (r: ReturnType<typeof starBudgetFixture>) => { r.scenario.storyEventPercent = 101; }],
  ['no price tiers', (r: ReturnType<typeof starBudgetFixture>) => { r.definition.products[0]!.tiers = []; }],
] as const)('rejects %s', (_label, mutate) => {
  const input = starBudgetFixture(); mutate(input); expect(() => validateStarBudget(input)).toThrow();
});

it('validates the reusable schema parts and rejects extra calculation channels', () => {
  const input = emptyStarBudget();
  const ajv = new Ajv({ strict: true, multipleOfPrecision: 10 });
  expect(ajv.compile(starBudgetDefinitionSchema)(input.definition)).toBe(true);
  const { rank, ...scenario } = input.scenario;
  expect(ajv.compile(starBudgetScenarioSchema)(scenario)).toBe(true);
  expect(() => validateStarBudget({ ...input, firstTimeArenaStars: 100 })).toThrow('未対応');
});
