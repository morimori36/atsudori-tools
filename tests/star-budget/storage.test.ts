import { expect, it } from 'vitest';
import { createStarBudgetStore, STAR_BUDGET_STORAGE_KEY } from '../../src/storage/star-budget';
import { exportStarBudget } from '../../src/domain/star-budget/validate';
import { starBudgetFixture } from '../helpers/star-budget';
import type { StoragePort } from '../../src/storage/local';

function memory(initial: [string, string][] = []) {
  const values = new Map(initial), writes: string[] = [];
  const port: StoragePort = { getItem: k => values.get(k) ?? null, setItem: (k, v) => { writes.push(k); values.set(k, v); } };
  return { values, writes, port };
}
it('does not write on startup, and only writes its own storage key', () => {
  const raw = JSON.stringify(starBudgetFixture()), m = memory([[STAR_BUDGET_STORAGE_KEY, raw], ['atsudori-tools.collection.v1', 'preserve-bytes']]);
  const store = createStarBudgetStore(m.port); expect(store.current()).toEqual(starBudgetFixture()); expect(m.writes).toEqual([]);
  expect(m.values.get(STAR_BUDGET_STORAGE_KEY)).toBe(raw);
  const next = store.current(); next.scenario.rank = 12; expect(store.update(next)).toBe(true);
  expect(m.writes).toEqual([STAR_BUDGET_STORAGE_KEY]); expect(m.values.get('atsudori-tools.collection.v1')).toBe('preserve-bytes');
});
it.each(['not-json', '{"format":"atsudori-tools/star-budget","schemaVersion":0}'])('protects damaged or old bytes until explicit successful recovery: %s', raw => {
  const m = memory([[STAR_BUDGET_STORAGE_KEY, raw]]), store = createStarBudgetStore(m.port);
  expect(store.protected()).toBe(true); expect(store.original()).toBe(raw); expect(m.writes).toEqual([]);
  expect(() => store.update(starBudgetFixture())).toThrow('保護');
  expect(m.values.get(STAR_BUDGET_STORAGE_KEY)).toBe(raw);
  store.update(starBudgetFixture(), { recover: true, atomic: true }); expect(store.protected()).toBe(false);
  expect(createStarBudgetStore(m.port).current()).toEqual(starBudgetFixture());
});
it('keeps manual edits exportable on save failure and imports/reset atomic without leaking error details', () => {
  const initial = starBudgetFixture(), raw = exportStarBudget(initial);
  const port: StoragePort = { getItem: () => raw, setItem: () => { throw new Error('sensitive storage content'); } };
  const store = createStarBudgetStore(port), next = structuredClone(initial); next.scenario.rank = 12;
  expect(store.update(next)).toBe(false); expect(store.current()).toEqual(next); expect(store.unsaved()).toBe(true);
  expect(exportStarBudget(store.current())).toContain('"rank": 12'); expect(store.message()).not.toContain('sensitive');
  expect(() => store.update(initial, { recover: true, atomic: true })).toThrow('現在のデータは変更していません');
  expect(store.current()).toEqual(next);
  const protectedStore = createStarBudgetStore({ getItem: () => 'corrupt', setItem: port.setItem });
  expect(() => protectedStore.update(initial, { recover: true, atomic: true })).toThrow();
  expect(protectedStore.protected()).toBe(true); expect(protectedStore.original()).toBe('corrupt');
});
it('protects unreadable storage from automatic replacement', () => {
  let writes = 0;
  const store = createStarBudgetStore({ getItem: () => { throw new Error(); }, setItem: () => { writes++; } });
  expect(store.protected()).toBe(true); expect(() => store.update(starBudgetFixture())).toThrow('保護'); expect(writes).toBe(0);
  expect(createStarBudgetStore(undefined).unsaved()).toBe(true);
});
