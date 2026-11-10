import { expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { starBudgetSchema } from '../../src/domain/star-budget/schema';
import { emptyStarBudget, exportStarBudget, importStarBudget, STAR_BUDGET_JSON_LIMIT, validateStarBudget } from '../../src/domain/star-budget/validate';
import { starBudgetFixture } from '../helpers/star-budget';

it('keeps generated schema in sync and round trips independent definitions without mutation', () => {
  const schema = JSON.parse(readFileSync('public/schemas/star-budget-v1.schema.json', 'utf8'));
  expect(schema).toEqual(starBudgetSchema);
  const structural = new Ajv({ strict: true, multipleOfPrecision: 10 }).compile(schema);
  for (const input of [emptyStarBudget(), starBudgetFixture()]) {
    expect(structural(input), JSON.stringify(structural.errors)).toBe(true);
    expect(importStarBudget(exportStarBudget(input))).toEqual(input);
  }
  const decimal = starBudgetFixture(); decimal.definition.event.intervalDays.value = 12.5;
  expect(structural(decimal)).toBe(true);
});

it.each([
  ['unsupported version', (r: ReturnType<typeof starBudgetFixture>) => { (r as { schemaVersion: number }).schemaVersion = 9; }],
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

it('rejects extra reward channels, dangerous keys, and large files without copying their content into errors', () => {
  const input = starBudgetFixture();
  expect(() => validateStarBudget({ ...input, firstTimeArenaStars: 100 })).toThrow('未対応');
  expect(() => importStarBudget('{"__proto__":{"secret":"private-content"}}')).toThrow('危険なキー');
  expect(() => importStarBudget(' '.repeat(STAR_BUDGET_JSON_LIMIT + 1))).toThrow('JSONが大きすぎます');
  expect(() => importStarBudget('sensitive raw input')).toThrow('構文');
  for (const p of input.definition.products) p.tiers = Array.from({ length: 20 }, () => ({ starCost: { value: 1, status: 'assumed', basis: '紙'.repeat(300) }, weeklyLimit: { value: 1, status: 'assumed', basis: '紙'.repeat(300) } }));
  expect(() => exportStarBudget(input)).toThrow('256KiB');
});
