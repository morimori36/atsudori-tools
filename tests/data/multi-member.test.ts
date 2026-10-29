import { expect, it } from 'vitest';
import { multiMemberFixture } from '../helpers/multi-member';
import { fictionalProfile } from '../helpers/conversion';
import { importCatalog, exportCatalog } from '../../src/data/catalog/validate';
import { importCollection, exportCollection } from '../../src/storage/collection';
import { evaluateCollection, summarizeBands } from '../../src/app/evaluate-collection';
import { potentialCollection } from '../../src/app/potential-collection';
import { exportConversion } from '../../src/app/export-conversion';
import { DEFAULT_TRAINING } from '../../src/app/hypothetical-training';

it.each([1,3,4])('calculates every selected card with %i Snaps in current and potential modes without changing export', async count => {
  const { master, collection } = multiMemberFixture();
  collection.snaps = master.snaps.slice(0,count).map(s => ({ ...collection.snaps[0]!, supportCardId:s.id }));
  const catalog = importCatalog(exportCatalog(master)), owned = importCollection(exportCollection(collection,catalog),catalog);
  const before = JSON.stringify({catalog,owned});
  for (const potential of [false,true]) {
    const colors = evaluateCollection(catalog,potential ? potentialCollection(catalog,owned) : owned,owned);
    expect(colors[0]!.slots.map(s => s.selection.member.status === 'selected' && s.selection.member.candidate.id)).toEqual([8301,8302,8303]);
    const expected = potential ? (count === 1 ? [1214,1086,1086] : [1214,1214,1214]) : (count === 1 ? [857,767,767] : [857,857,857]);
    expect(colors[0]!.slots.map(s => s.result?.bandRating)).toEqual(expected);
    expect(colors[0]!.slots.map(s => s.result?.snapMultiplierBp)).toEqual(count === 1 ? [11180,10000,10000] : [11180,11180,11180]);
    expect(colors[0]!.rating).toBe(expected.reduce((sum,n) => sum+n,0));
    expect(summarizeBands(colors)[0]!.rating).toBe(expected.reduce((sum,n) => sum+n,0));
  }
  const profile = await fictionalProfile(catalog);
  for (const applyTraining of [false,true]) {
    const output = JSON.parse((await exportConversion(catalog,owned,profile,{applyTraining,training:{...DEFAULT_TRAINING}})).text);
    expect(output.roster.map((r:{id:number})=>r.id)).toEqual([8301,8302,8303,8304]);
    expect(output.supports).toHaveLength(count);
  }
  expect(JSON.stringify({catalog,owned})).toBe(before);
  expect(importCollection(exportCollection(owned,catalog),catalog)).toEqual(collection);
});
it('adds all selected members across color subtotals into the band total', () => {
  const { master, collection } = multiMemberFixture();
  master.members.push({...master.members[0]!,id:8305,cardType:8});
  collection.members.push({...collection.members[0]!,cardId:8305});
  expect(evaluateCollection(master,collection).map(c=>c.rating)).toEqual([2391,767]);
  expect(summarizeBands(evaluateCollection(master,collection))[0]!.rating).toBe(3158);
  expect(summarizeBands(evaluateCollection(master,potentialCollection(master,collection),collection))[0]!.rating).toBe(4472);
});
it.each([[3,2],[3,3]])('counts two independent cards of rarities %j / %j including the Snap-less card', (first,second) => {
  const {master,collection} = multiMemberFixture();
  master.members[0]!.rarity=first; master.members[1]!.rarity=second;
  collection.members=collection.members.slice(0,2);
  expect(evaluateCollection(master,collection)[0]!.slots.map(s=>s.result?.bandRating)).toEqual([857,767]);
  expect(evaluateCollection(master,collection)[0]!.rating).toBe(1624);
});
