import { expect, it } from 'vitest';
import { defaultEventInput } from '../../src/domain/event-planner/model';
import { exportEventInput, importEventInput, validateEventInput } from '../../src/domain/event-planner/validate';
import { EVENT_STORAGE_KEY, loadEventInput, saveEventInput } from '../../src/storage/event-planner';
import { exampleEventInput } from '../helpers/event-input';

it('round trips every field with a dedicated format and localStorage key', () => {
  const input = exampleEventInput(), values = new Map([['atsudori-tools.catalog.v1', 'catalog bytes'], ['atsudori-tools.collection.v1', 'collection bytes']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, text: string) => { values.set(key, text); } };
  expect(loadEventInput(storage)).toEqual({ status: 'empty' });
  expect(saveEventInput(storage, input)).toBe(true);
  expect(loadEventInput(storage)).toEqual({ status: 'loaded', input });
  expect(values.get('atsudori-tools.catalog.v1')).toBe('catalog bytes'); expect(values.get('atsudori-tools.collection.v1')).toBe('collection bytes');
  expect(values.size).toBe(3); expect(importEventInput(values.get(EVENT_STORAGE_KEY)!)).toEqual(input);
});

it('exposes unreadable bytes without writing them and handles blocked storage', () => {
  let writes = 0;
  expect(loadEventInput({ getItem: () => '{broken', setItem: () => { writes++; } })).toEqual({ status: 'invalid', raw: '{broken' });
  expect(writes).toBe(0);
  expect(loadEventInput(undefined)).toEqual({ status: 'unavailable' });
  const blocked = { getItem: (): never => { throw new Error('private details'); }, setItem: (): never => { throw new Error('private details'); } };
  expect(loadEventInput(blocked)).toEqual({ status: 'unavailable' });
  expect(saveEventInput(blocked, defaultEventInput())).toBe(false);
  expect(saveEventInput(undefined, defaultEventInput())).toBe(false);
});

it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '', null, undefined])('rejects invalid integer input %s', value => {
  expect(() => validateEventInput({ ...defaultEventInput(), targetPt: value })).toThrow('目標イベントpt');
});

it('rejects unknown versions/keys, missing values, invalid candidates, and excessive search/file sizes', () => {
  const input = defaultEventInput();
  for (const bad of [{ ...input, format: 'atsudori-tools/collection' }, { ...input, schemaVersion: 2 }, { ...input, extra: true }, { ...input, maxUnits: 10001 }, { ...input, minutesPerRun: 0 }, { ...input, normalMultiplier: 0 }, { ...input, normal: null }, { ...input, normal: Array(6).fill(input.normal[0]) }, { ...input, bases: {} }])
    expect(() => validateEventInput(bad)).toThrow();
  for (const changes of [{ rank: 'SS' }, { bonus: -1 }, { bonus: '' }, { bonus: 0.001 }, { enabled: 1 }, { name: 'a'.repeat(201) }, { memo: 'unsupported' }])
    expect(() => validateEventInput({ ...input, normal: [{ ...input.normal[0], ...changes }] })).toThrow();
  const missing = structuredClone(input) as Partial<typeof input>; delete missing.currentCP;
  expect(() => validateEventInput(missing)).toThrow();
  expect(() => importEventInput('{"__proto__":{}}')).toThrow();
  expect(() => importEventInput('{private payload')).toThrow('JSONを読み取れません');
  expect(() => importEventInput(' '.repeat(65537))).toThrow('64KiB');
  expect(() => exportEventInput({ ...input, currentCP: NaN })).toThrow();
});

it('preserves empty labels/zero bases and validates without sharing mutable objects', () => {
  const input = defaultEventInput(); input.bases.normal.S.cp = 0; input.maxUnits = 0; input.normal[0]!.bonus = 12.34;
  const next = importEventInput(exportEventInput(input)); expect(next).toEqual(input);
  next.bases.normal.S.pt = 5; expect(input.bases.normal.S.pt).toBe(75);
});
