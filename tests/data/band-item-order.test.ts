import { expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../../public/schemas/catalog-v1.schema.json';
import { importCatalog, exportCatalog } from '../../src/data/catalog/validate';
import { importCollection, exportCollection } from '../../src/storage/collection';
import { evaluateCollection } from '../../src/app/evaluate-collection';
import { bandItemsForDisplay } from '../../src/ui/band-item-order';
import { displayOrderFixture } from '../helpers/display-order';

const structural = new Ajv2020({ strict: true }).compile(schema);
export function orderedItems() {
  const fixture = displayOrderFixture();
  // Independent item order: unrelated to character order, IDs or names.
  fixture.master.bandItems.forEach((item, i) => { item.displayOrder = [90, 0, 60, 10, 30, 0][i]!; });
  return fixture;
}
it('sorts only the view, preserving catalog/collection round trips and evaluation', () => {
  const { master, collection } = orderedItems();
  collection.bandItems = Object.fromEntries(master.bandItems.map(item => [item.id, 1]));
  collection.characterRanks = Object.fromEntries(master.characters.map(c => [c.id, 1]));
  const before = JSON.stringify({ master, collection });
  const imported = importCatalog(exportCatalog(master));
  expect(imported).toEqual(master);
  expect(structural(master)).toBe(true);
  expect(bandItemsForDisplay(master.bandItems.filter(i => i.bandId === 8101)).map(i => i.id)).toEqual([8698, 8696, 8694, 8692, 8601]);
  expect(importCollection(exportCollection(collection, imported), imported)).toEqual(collection);
  const legacy = structuredClone(master);
  legacy.bandItems.forEach(i => { delete i.displayOrder; });
  expect(evaluateCollection(imported, collection)).toEqual(evaluateCollection(legacy, collection));
  expect(bandItemsForDisplay(legacy.bandItems.filter(i => i.bandId === 8101)).map(i => i.id)).toEqual([8698, 8696, 8601, 8694, 8692]);
  expect(JSON.stringify({ master, collection })).toBe(before);
});
it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, null, '2', true])('rejects invalid item order %s at both structure gates', value => {
  const { master } = orderedItems();
  const bad = { ...master, bandItems: master.bandItems.map((r, i) => i ? r : { ...r, displayOrder: value }) };
  expect(structural(bad)).toBe(false);
  expect(() => importCatalog(JSON.stringify(bad))).toThrow('displayOrder');
});
it.each(['duplicate', 'missing'])('rejects %s item order without inference', kind => {
  const { master } = orderedItems();
  if (kind === 'missing') delete master.bandItems[0]!.displayOrder;
  else master.bandItems[0]!.displayOrder = master.bandItems[1]!.displayOrder;
  expect(() => importCatalog(JSON.stringify(master))).toThrow('displayOrder');
  expect(() => bandItemsForDisplay(master.bandItems.filter(i => i.bandId === 8101))).toThrow('displayOrder');
});
it('allows ordered and legacy bands together, and arbitrary group sizes', () => {
  const { master } = orderedItems();
  delete master.bandItems.at(-1)!.displayOrder;
  expect(importCatalog(exportCatalog(master))).toEqual(master);
  expect(bandItemsForDisplay(master.bandItems.filter(i => i.bandId === 8197))).toEqual([master.bandItems.at(-1)]);
  expect(bandItemsForDisplay([])).toEqual([]);
  expect(bandItemsForDisplay([{ id: 4, bandId: 8, name: '架空の糸', displayOrder: 8 }, { id: 9, bandId: 8, name: '架空の針', displayOrder: 0 }]).map(i => i.id)).toEqual([9, 4]);
});
