import { expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../../public/schemas/catalog-v1.schema.json';
import { importCatalog, exportCatalog, validateCatalog, catalogIssues } from '../../src/data/catalog/validate';
import { exportCollection, importCollection } from '../../src/storage/collection';
import { evaluateCollection } from '../../src/app/evaluate-collection';
import { characterDisplayOrder, characterRowsForDisplay, progressCharacters } from '../../src/ui/character-order';
import { displayOrderFixture } from '../helpers/display-order';

const structural = new Ajv2020({ strict: true }).compile(schema);
it('uses complete per-band metadata without mutating catalog, collection or calculations', () => {
  const { master, collection } = displayOrderFixture();
  const before = JSON.stringify({ master, collection });
  const imported = importCatalog(exportCatalog(master));
  expect(imported).toEqual(master);
  expect(importCollection(exportCollection(collection, imported), imported)).toEqual(collection);
  expect(structural(master)).toBe(true);
  const ordered = characterDisplayOrder(imported.characters);
  expect(ordered.map(c => c.id)).toEqual([8262, 8239, 8284, 8297, 8201, 8314, 8306, 8328]);
  expect(progressCharacters(imported.characters.filter(c => c.bandId === 8197)).map(c => c.id)).toEqual([8314, 8306, 8328]);
  const legacy = structuredClone(master);
  legacy.characters.forEach(c => { delete c.displayOrder; });
  expect(evaluateCollection(imported, collection)).toEqual(evaluateCollection(legacy, collection));
  expect(JSON.stringify({ master, collection })).toBe(before);
});
it('preserves old v1 serialization and the prior order of each view', () => {
  const { master } = displayOrderFixture();
  master.characters.forEach(c => { delete c.displayOrder; });
  expect(importCatalog(exportCatalog(master))).toEqual(master);
  expect(structural(master)).toBe(true);
  const band = master.characters.filter(c => c.bandId === 8101);
  expect(progressCharacters(band).map(c => c.id)).toEqual([8201, 8284, 8297, 8239, 8262]);
  expect(characterDisplayOrder(master.characters)).toEqual(master.characters);
  const reversed = [...band].reverse();
  expect(characterRowsForDisplay(reversed, master.characters, c => c.id)).toEqual(reversed);
});
it.each([-1, 0.2, Number.MAX_SAFE_INTEGER + 1, null, '2', true])('rejects invalid displayOrder %s in both structure gates', value => {
  const { master } = displayOrderFixture();
  const bad = { ...master, characters: master.characters.map((c, i) => i ? c : { ...c, displayOrder: value }) };
  expect(() => validateCatalog(bad)).toThrow('displayOrder');
  expect(structural(bad)).toBe(false);
});
it.each(['duplicate', 'missing'] as const)('rejects %s metadata without inferring a fallback order', kind => {
  const { master } = displayOrderFixture();
  if (kind === 'duplicate') master.characters[0]!.displayOrder = master.characters[1]!.displayOrder;
  else delete master.characters[0]!.displayOrder;
  expect(catalogIssues(validateCatalog(master)).join(' ')).toContain('displayOrder');
  expect(() => importCatalog(JSON.stringify(master))).toThrow('displayOrder');
  expect(() => progressCharacters(master.characters.filter(c => c.bandId === 8101))).toThrow('displayOrder');
});
it('allows a legacy band beside an ordered band and keeps full-band order for a displayed subset', () => {
  const { master } = displayOrderFixture();
  master.characters.filter(c => c.bandId === 8197).forEach(c => { delete c.displayOrder; });
  expect(() => importCatalog(JSON.stringify(master))).not.toThrow();
  const subset = master.characters.filter(c => [8201, 8297, 8328, 8314].includes(c.id));
  expect(characterRowsForDisplay(subset, master.characters, c => c.id).map(c => c.id)).toEqual([8297, 8201, 8328, 8314]);
});
