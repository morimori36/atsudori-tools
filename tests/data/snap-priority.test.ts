import { expect, it } from 'vitest';
import { evaluateCollection } from '../../src/app/evaluate-collection';
import { potentialCollection } from '../../src/app/potential-collection';
import { importCatalog, exportCatalog } from '../../src/data/catalog/validate';
import { importCollection, exportCollection } from '../../src/storage/collection';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';

/** Independently invented amounts; no observed cards or owned data. */
function fixture() {
  const master = syntheticCatalog(), collection = syntheticCollection(master);
  const base = master.snaps[0]!;
  master.snaps = [
    { ...base, rarity:10, maxPercentBp:{performance:600,technic:600,visual:600} },
    { ...base, id:8504, rarity:2, maxPercentBp:{performance:500,technic:500,visual:500} },
    { ...base, id:8505, maxPercentBp:{performance:2000,technic:2000,visual:2000} },
  ];
  master.snapRanks[0]!.limitLevel = 2;
  collection.snaps.push({supportCardId:8504,level:1,rank:1});
  // Exercise the actual public catalog/collection contracts too.
  return {master:importCatalog(exportCatalog(master)), collection:importCollection(exportCollection(collection,master),master)};
}
function selected(master: ReturnType<typeof fixture>['master'], collection: ReturnType<typeof fixture>['collection']) {
  return evaluateCollection(master,collection)[0]!.slots[0]!.selection.snap;
}
it('reverses EX versus R priority when only the owned R level rises, in both display modes', () => {
  const {master,collection} = fixture();
  expect(selected(master,collection)).toMatchObject({candidate:{id:8501,scoreBp:1100}});
  collection.snaps[1]!.level = 2;
  const before = JSON.stringify({master,collection});
  // R: 3*500+200=1700; EX: 3*300+200=1100. Unowned 8505 is excluded.
  expect(selected(master,collection)).toMatchObject({candidate:{id:8504,scoreBp:1700}});
  const virtual = evaluateCollection(master,potentialCollection(master,collection),collection)[0]!.slots[0]!;
  expect(virtual.selection.snap).toEqual(selected(master,collection));
  expect(evaluateCollection(master,collection)[0]!.slots[0]!.input?.snapPercentBp).toEqual({performance:500,technic:500,visual:500});
  expect(virtual.result).toBeDefined();
  expect(JSON.stringify({master,collection})).toBe(before);
  collection.snaps.reverse(); master.snaps.reverse();
  expect(selected(master,collection)).toMatchObject({candidate:{id:8504}});
});
it('adds 200 bp per U even when displayed percentages and Lv stay unchanged', () => {
  const {master,collection} = fixture();
  expect(selected(master,collection)).toMatchObject({candidate:{id:8501}});
  collection.snaps[1]!.rank = 2;
  // R: 3*250+400=1150 beats EX's 1100, solely through U.
  expect(selected(master,collection)).toMatchObject({candidate:{id:8504,scoreBp:1150}});
});
it('uses ascending Snap ID for equal effective scores regardless of rarity or import order', () => {
  const {master,collection} = fixture();
  master.snaps[1]!.maxPercentBp = {...master.snaps[0]!.maxPercentBp};
  collection.snaps.reverse();
  expect(selected(master,collection)).toMatchObject({candidate:{id:8501,scoreBp:1100},provisional:true});
});
it.each([0,-1,1.5,NaN,undefined])('rejects malformed owned Lv or U (%s), including an otherwise losing Snap', value => {
  for (const key of ['level','rank'] as const) {
    const {master,collection} = fixture();
    collection.snaps[1]![key] = value as number;
    expect(()=>evaluateCollection(master,collection)).toThrow();
  }
});
it.each(['level','rank','card','cap','linkage'] as const)('rejects missing or invalid Snap growth: %s', kind => {
  const {master,collection} = fixture();
  if (kind === 'level') master.snapLevels = [];
  if (kind === 'rank') master.snapRanks = [];
  if (kind === 'card') master.snaps = master.snaps.filter(s=>s.id!==8504);
  if (kind === 'cap') collection.snaps[1]!.level = 3;
  if (kind === 'linkage') master.snapRanks[0]!.supportSkillLevels = [2,2];
  expect(()=>evaluateCollection(master,collection)).toThrow();
});
