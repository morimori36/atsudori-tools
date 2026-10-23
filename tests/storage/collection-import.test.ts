import { describe, expect, it } from 'vitest';
import { prepareCollectionImport } from '../../src/storage/collection-import';
import { emptyCollection, exportCollection, importCollection } from '../../src/storage/collection';
import type { Collection } from '../../src/storage/collection';
import { syntheticCatalog, syntheticCollection } from '../helpers/synthetic';

describe('collection import with saved character progress', () => {
  const master = syntheticCatalog();
  const saved = () => ({ ...syntheticCollection(master), characterProgress: {
    8201: { stamps: 8, bondRankTotal: 30, liveClears: 100, songClears: 10, skillLevel5: 2 },
  } });

  const omittedProgress: Collection['characterProgress'][] = [undefined, {}, { 8201: {} }];
  it.each(omittedProgress)('retains omitted progress at every level: %j', progress => {
    const current = saved(), incoming = emptyCollection(master);
    if (progress !== undefined) incoming.characterProgress = progress;
    const before = structuredClone({ current, incoming });
    const result = prepareCollectionImport(incoming, current, master);
    expect(result.characterProgress).toEqual(current.characterProgress);
    expect(result.members).toEqual([]);
    expect(result.snaps).toEqual([]);
    expect(result.characterRanks).toEqual({});
    expect(result.bandItems).toEqual({});
    expect({ current, incoming }).toEqual(before);
    expect(importCollection(exportCollection(result, master), master)).toEqual(result);
  });

  it('uses explicit zero and new values while retaining other fields and characters', () => {
    const extended = { ...master, characters: [...master.characters,
      { id: 8202, bandId: 8101, name: '架空奏者B' }] };
    const incoming = { ...emptyCollection(extended), characterProgress: {
      8201: { stamps: 0 }, 8202: { songClears: 5 },
    } };
    const current = { ...saved(), characterProgress: { ...saved().characterProgress, 8202: { liveClears: 50 } } };
    expect(prepareCollectionImport(incoming, current, extended).characterProgress).toEqual({
      8201: { ...saved().characterProgress[8201], stamps: 0 },
      8202: { liveClears: 50, songClears: 5 },
    });
  });

  it('allows explicit full replacement for backup restoration', () => {
    const incoming = syntheticCollection(master);
    expect(prepareCollectionImport(incoming, saved(), master, false)).toEqual(incoming);
    expect(prepareCollectionImport({ ...incoming, characterProgress: {} }, saved(), master, false).characterProgress).toEqual({});
  });

  it('does not fabricate a progress field for legacy files or blank storage', () => {
    const incoming = syntheticCollection(master);
    expect(prepareCollectionImport(incoming, emptyCollection(master), master)).not.toHaveProperty('characterProgress');
  });

  it('rejects invalid or mismatched inputs before combining them', () => {
    expect(() => prepareCollectionImport({ ...syntheticCollection(master), characterProgress: { 8201: { stamps: -1 } } }, saved(), master)).toThrow();
    expect(() => prepareCollectionImport(syntheticCollection(master), { ...saved(), catalogId: 'other-catalog' }, master)).toThrow(/catalogId/);
  });
});
