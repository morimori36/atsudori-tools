import { expect, it } from 'vitest';
import { estimateBondRankTheory } from '../../src/domain/character-rank/bond-theory';
import { estimateCharacterRank } from '../../src/domain/character-rank/estimate';
import { exportCollection, importCollection } from '../../src/storage/collection';
import { loadCollection, saveCollection, STORAGE_KEY } from '../../src/storage/local';
import { bondTheoryFixture } from '../helpers/bond-theory';

function ready(result: ReturnType<typeof estimateBondRankTheory>) {
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(result.reason);
  return result;
}

it('starts from one, traverses multiple feedback steps and stops at the imported rank cap', () => {
  const { master, collection } = bondTheoryFixture();
  const result = ready(estimateBondRankTheory(master, collection, 8101));
  // total=4,8,12,16 awards 3,6,9,12 EXP; ranks=2,3,4,5.
  expect(result.iterations).toBe(6);
  expect(result.pairs).toHaveLength(10);
  expect(new Set(result.pairs.map(p => `${p.characterA}:${p.characterB}`)).size).toBe(10);
  expect(result.pairs.every(p => p.characterA !== p.characterB && p.rank === 5)).toBe(true);
  expect(result.characters.map(c => [c.baseRank, c.finalRank, c.bondRankTotal])).toEqual(Array.from({ length: 5 }, () => [1, 5, 20]));
  expect(result.characters.every(c => c.missingProgress.length === 0)).toBe(true);
});

it('caps each pair at the lower character rank, with no cross-band pairs', () => {
  const { master, collection } = bondTheoryFixture();
  master.rankDefinition!.achievements[0]!.thresholds = [1000];
  master.stamps=Array.from({length:4},(_,i)=>({id:9100+i,name:`架空紙片${i}`,characterIds:master.characters.filter((_,j)=>i===0||j>0).map(c=>c.id)}));
  collection.ownedStampIds=master.stamps.map(s=>s.id);
  master.bands.push({ id: 8190, name: '架空の別紙バンド' });
  master.characters.push({ id: 8290, bandId: 8190, name: '架空の別紙奏者' });
  const result = ready(estimateBondRankTheory(master, collection, 8101));
  expect(result.pairs.filter(p => p.characterA === 8201).map(p => p.rank)).toEqual([2, 2, 2, 2]);
  expect(result.pairs.filter(p => p.characterA !== 8201).every(p => p.rank === 5)).toBe(true);
  expect(result.characters.map(c => c.bondRankTotal)).toEqual([8, 17, 17, 17, 17]);
  expect(ready(estimateBondRankTheory(master, collection, 8190))).toMatchObject({ pairs: [], characters: [{ baseRank: 1, finalRank: 1, bondRankTotal: 0 }] });
});

it('rejects a self-consistent high solution unreachable from the initial state', () => {
  const { master, collection } = bondTheoryFixture();
  master.rankDefinition!.achievements[0]!.thresholds = [8];
  // rank2 => four pairs at2 => total8 =>3 EXP =>rank2, but rank1
  // only gives total4: no first reward, so rank2 cannot be reached.
  const result = ready(estimateBondRankTheory(master, collection, 8101));
  expect(result.iterations).toBe(1);
  expect(result.characters.every(c => c.finalRank === 1 && c.bondRankTotal === 4)).toBe(true);
});

it('uses nonconsecutive imported rank numbers and cumulative EXP', () => {
  const { master, collection } = bondTheoryFixture();
  master.characterRankLevels = [2, 6, 11];
  master.rankDefinition!.rankThresholds = [{ rank: 2, exp: 0 }, { rank: 6, exp: 3 }, { rank: 11, exp: 6 }];
  master.rankDefinition!.achievements[0]!.thresholds = [8, 24];
  // Initial rank2 gives total8 =>3 EXP=>rank6, total24=>6 EXP=>11.
  expect(ready(estimateBondRankTheory(master, collection, 8101)).characters.every(c => c.baseRank === 2 && c.finalRank === 11 && c.bondRankTotal === 44)).toBe(true);
});

it('ignores overrides and manual bond totals while preserving normal estimates, storage and JSON bytes', () => {
  const { master, collection } = bondTheoryFixture();
  master.rankDefinition!.achievements[0]!.thresholds = [8];
  collection.characterRanks = { 8201: 5 };
  collection.characterProgress = { 8201: { bondRankTotal: 999, skillLevel5: 71 } };
  const bytes = exportCollection(collection, master), catalogBytes = JSON.stringify(master);
  const data = new Map<string, string>(), port = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  expect(saveCollection(port, collection, master).status).toBe('saved');
  const saved = data.get(STORAGE_KEY);
  const result = ready(estimateBondRankTheory(master, collection, 8101));
  expect(result.characters.every(c => c.baseRank === 1 && c.finalRank === 1)).toBe(true);
  expect(estimateCharacterRank(master, collection, 8201)).toMatchObject({ estimatedRank: 2, effectiveRank: 5 });
  expect(exportCollection(collection, master)).toBe(bytes);
  expect(importCollection(bytes, master)).toEqual(collection);
  expect(loadCollection(port, master)).toEqual({ status: 'loaded', collection });
  expect(data.get(STORAGE_KEY)).toBe(saved);
  expect(JSON.stringify(master)).toBe(catalogBytes);
  const { characterProgress, ...legacy } = collection;
  expect(importCollection(exportCollection(legacy, master), master)).toEqual(legacy);
});

it('keeps every nonbond ownership, cultivation and progress condition in the existing engine', () => {
  const { master, collection } = bondTheoryFixture();
  master.characterRankLevels = Array.from({ length: 12 }, (_, i) => i + 1);
  master.rankDefinition!.rankThresholds = master.characterRankLevels.map(rank => ({ rank, exp: (rank - 1) * 3 }));
  const kinds = ['members', 'snaps', 'training', 'awakening', 'snapRank', 'skills', 'stamps', 'songClears', 'liveClears'] as const;
  master.rankDefinition!.achievements = [master.rankDefinition!.achievements[0]!, ...kinds.map(kind => ({
    id: `paper-${kind}`, kind, label: `架空条件${kind}`, stage: ['training', 'awakening', 'snapRank', 'skills'].includes(kind) ? 2 : null, thresholds: [1], exp: 3,
  }))];
  master.rankDefinition!.achievements[0]!.thresholds = [1000];
  master.rankDefinition!.manualProgress.push({ key: 'songClears', label: '架空曲' }, { key: 'liveClears', label: '架空ライブ' });
  Object.assign(collection.members[0]!, { level: 2, trainingStage: 2, awakeningStage: 2, liveSkillLevel: 2, gekisouSkillLevel: 2 });
  Object.assign(collection.snaps[0]!, { level: 2, rank: 2 });
  collection.characterProgress = { 8201: { stamps: 1, songClears: 1, liveClears: 1, bondRankTotal: 9999, skillLevel5: 9999 } };
  master.stamps=[{id:9100,name:"架空紙片",characterIds:[8201]}];collection.ownedStampIds=[9100];master.songClearCounts={8201:1};
  // All nine independent conditions award once: 9*3=27 =>rank10.
  expect(ready(estimateBondRankTheory(master, collection, 8101)).characters[0]).toEqual({ id: 8201, baseRank: 10, finalRank: 10, bondRankTotal: 4, missingProgress: [] });
});

it('suspends without definitions, bond conditions, characters or matching legal rank rows', () => {
  for (const change of [
    (m: ReturnType<typeof bondTheoryFixture>['master']) => { delete m.rankDefinition; },
    (m: ReturnType<typeof bondTheoryFixture>['master']) => { m.rankDefinition!.achievements.shift(); m.rankDefinition!.manualProgress.shift(); },
    (m: ReturnType<typeof bondTheoryFixture>['master']) => { m.characterRankLevels = [1]; },
    (m: ReturnType<typeof bondTheoryFixture>['master']) => { m.rankDefinition!.rankThresholds[0]!.exp = 1; },
  ]) {
    const { master, collection } = bondTheoryFixture(); change(master);
    expect(estimateBondRankTheory(master, collection, 8101).status).toBe('pending');
  }
  const { master, collection } = bondTheoryFixture();
  expect(estimateBondRankTheory(master, collection, 9999).status).toBe('pending');
});

it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('suspends invalid progress %s without partial results', value => {
  const { master, collection } = bondTheoryFixture();
  collection.characterProgress = { 8201: { stamps: value } };
  expect(estimateBondRankTheory(master, collection, 8101)).toEqual({ status: 'pending', reason: expect.any(String) });
});

it('suspends broken ownership and unsafe bond sums', () => {
  const { master, collection } = bondTheoryFixture();
  collection.members[0]!.cardId = 9999;
  expect(estimateBondRankTheory(master, collection, 8101).status).toBe('pending');
  collection.members = [];
  master.characterRankLevels = [Number.MAX_SAFE_INTEGER];
  master.rankDefinition!.rankThresholds = [{ rank: Number.MAX_SAFE_INTEGER, exp: 0 }];
  expect(estimateBondRankTheory(master, collection, 8101).status).toBe('pending');
});
