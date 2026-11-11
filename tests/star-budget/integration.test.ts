import { expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';
import { emptyStarBudget } from '../../src/domain/star-budget/validate';
import { defaultStarBudgetScenario, PRODUCT_IDS } from '../../src/domain/star-budget/model';
import { catalogBase, exportCatalog, importCatalog } from '../../src/data/catalog/validate';
import { exportCollection, importCollection, validateCollection } from '../../src/storage/collection';
import { prepareCollectionImport } from '../../src/storage/collection-import';

const master = () => {
  const m = syntheticCatalog();
  return { ...m, starBudgetDefinition: { ...emptyStarBudget().definition, revision: m.revision } };
};
const schema = (name: string) => new Ajv({ strict: true, multipleOfPrecision: 10 })
  .compile(JSON.parse(readFileSync('public/schemas/' + name + '-v1.schema.json', 'utf8')));

it('round trips optional catalog definitions and retains them in catalogBase', () => {
  const m = master();
  expect(schema('catalog')(m)).toBe(true);
  expect(importCatalog(exportCatalog(m))).toEqual(m);
  expect(catalogBase(m).starBudgetDefinition).toEqual(m.starBudgetDefinition);
  const old = syntheticCatalog();
  expect(importCatalog(exportCatalog(old))).not.toHaveProperty('starBudgetDefinition');
});

it.each([
  ['revision', (d: ReturnType<typeof master>['starBudgetDefinition']) => { d.revision = 'other'; }],
  ['unknown key', (d: ReturnType<typeof master>['starBudgetDefinition']) => { Object.assign(d, { extra: 1 }); }],
  ['negative', (d: ReturnType<typeof master>['starBudgetDefinition']) => { d.loginDaily.value = -1; }],
  ['missing product', (d: ReturnType<typeof master>['starBudgetDefinition']) => { d.products.pop(); }],
  ['duplicate product', (d: ReturnType<typeof master>['starBudgetDefinition']) => { d.products[0]!.id = d.products[1]!.id; }],
  ['no tiers', (d: ReturnType<typeof master>['starBudgetDefinition']) => { d.products[0]!.tiers = []; }],
  ['inconsistent evidence', (d: ReturnType<typeof master>['starBudgetDefinition']) => { d.loginDaily.status = 'confirmed'; }],
] as const)('rejects catalog %s', (_name, mutate) => {
  const m = master(); mutate(m.starBudgetDefinition);
  expect(() => importCatalog(JSON.stringify(m))).toThrow();
});

it.each([false, true])('preserves ownership and legacy arena=%s across JSON and old/new catalog revisions', includeArena => {
  const m = master(), scenario = { ...defaultStarBudgetScenario(), storyEventPercent: 67, eventPremium: true, seasonPremium: true, includeArena };
  const c = { ...syntheticCollection(m), tgwRank: 7, resourceInventory: { 'fictional-resource': 0 }, starBudgetScenario: scenario };
  expect(schema('collection')(c)).toBe(true);
  expect(importCollection(exportCollection(c, m), m)).toEqual(c);
  expect(validateCollection(c, { ...syntheticCatalog(), revision: 'next' })).toEqual(c);
  expect(validateCollection(c, m)).toEqual(c);
  const legacy = syntheticCollection(m);
  expect(importCollection(exportCollection(legacy, m), m)).not.toHaveProperty('starBudgetScenario');
  expect(prepareCollectionImport(legacy, c, m).starBudgetScenario).toEqual(scenario);
  expect(prepareCollectionImport(legacy, c, m, false)).not.toHaveProperty('starBudgetScenario');
  const explicit = { ...legacy, starBudgetScenario: { ...defaultStarBudgetScenario(), selectedProducts: [] } };
  expect(prepareCollectionImport(explicit, c, m).starBudgetScenario).toEqual(explicit.starBudgetScenario);
  expect(prepareCollectionImport(explicit, c, m).members).toEqual(legacy.members);
});

it.each([
  { rank: 1 }, { eventPremium: 0 }, { storyEventPercent: -1 }, { storyEventPercent: 101 },
  { storyEventPercent: 0.5 }, { selectedProducts: ['sr-1', 'sr-1'] }, { selectedProducts: ['unknown'] },
])('rejects invalid scenario %j in schema and semantic validation', patch => {
  const c = { ...syntheticCollection(master()), starBudgetScenario: { ...defaultStarBudgetScenario(), ...patch } };
  expect(schema('collection')(c)).toBe(false);
  expect(() => validateCollection(c, master())).toThrow();
});

it('returns fresh reading defaults, accepting explicit zero and preserving omitted JSON', () => {
  const defaults = defaultStarBudgetScenario();
  expect(defaults).toEqual({ storyEventPercent: null, eventPremium: false, seasonPremium: false, includeArena: false, selectedProducts: PRODUCT_IDS });
  defaults.selectedProducts.pop();
  expect(defaultStarBudgetScenario().selectedProducts).toHaveLength(11);
  const m = master(), c = { ...syntheticCollection(m), starBudgetScenario: { ...defaultStarBudgetScenario(), storyEventPercent: 0 } };
  expect(importCollection(exportCollection(c, m), m)).toEqual(c);
});
