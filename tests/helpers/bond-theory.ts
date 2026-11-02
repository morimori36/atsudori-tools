import { syntheticCatalog, syntheticCollection } from './synthetic';
import type { RankDefinition } from '../../src/domain/character-rank/definitions';

/** Independent toy progression: every four bond points awards three paper EXP.
 * This is invented arithmetic, not renamed game data.
 */
export function bondTheoryFixture() {
  const master = syntheticCatalog();
  master.characters = Array.from({ length: 5 }, (_, i) => ({ id: 8201 + i, bandId: 8101, name: `架空の紙奏者${i + 1}` }));
  master.characterRankLevels = [1, 2, 3, 4, 5];
  master.rankDefinition = {
    engine: 'achievement-thresholds/1', id: 'invented-paper-bonds', version: 'toy-1',
    provenance: { sources: [{ id: 'independently-invented-paper', revision: 'toy-1', sha256: 'a'.repeat(64) }] },
    manualProgress: [{ key: 'bondRankTotal', label: '架空の紙絆' }, { key: 'stamps', label: '架空の紙進捗' }],
    achievements: [
      { id: 'paper-bond', kind: 'bondRankTotal', label: '架空の紙絆', stage: null, thresholds: [4, 8, 12, 16], exp: 3 },
      { id: 'paper-stamps', kind: 'stamps', label: '架空の紙進捗', stage: null, thresholds: [1, 2, 3, 4], exp: 3 },
    ],
    rankThresholds: [0, 3, 6, 9, 12].map((exp, i) => ({ rank: i + 1, exp })),
  } satisfies RankDefinition;
  return { master, collection: syntheticCollection(master) };
}
