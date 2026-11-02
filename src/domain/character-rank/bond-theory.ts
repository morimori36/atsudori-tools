import type { Masterdata } from '../../data/catalog/model';
import { validateCatalog } from '../../data/catalog/validate';
import { validateCollection } from '../../storage/collection';
import type { Collection } from '../../storage/collection';
import type { CharacterProgress, ManualProgressKey } from './definitions';
import { catalogRankRules } from './rules';
import { estimateCharacterRanks } from './estimate';

export interface BondPair { characterA: number; characterB: number; rank: number }
export interface BondTheoryCharacter {
  id: number;
  baseRank: number;
  finalRank: number;
  bondRankTotal: number;
  missingProgress: ManualProgressKey[];
}
export type BondTheoryResult =
  | { status: 'ready'; characters: BondTheoryCharacter[]; pairs: BondPair[]; iterations: number }
  | { status: 'pending'; reason: string };

/** Pure projection: never writes derived ranks or bond totals back to collection.
 * Each same-band pair starts at one and is capped at the lower character rank.
 */
export function estimateBondRankTheory(master: Masterdata, collection: Collection, bandId: number): BondTheoryResult {
  try {
    validateCatalog(master);
    const source = validateCollection(collection, master);
    const rules = catalogRankRules(master);
    if (!rules?.document.achievements.some(a => a.kind === 'bondRankTotal')) {
      return { status: 'pending', reason: '絆ランク合計の達成条件を含むランク定義が必要です。' };
    }
    const characters = master.characters.filter(c => c.bandId === bandId);
    if (!master.bands.some(b => b.id === bandId) || !characters.length) {
      return { status: 'pending', reason: '対象バンドのキャラクター定義がありません。' };
    }
    const characterProgress: Record<string, CharacterProgress> = Object.fromEntries(Object.entries(source.characterProgress ?? {}).map(([id, progress]) => {
      const { bondRankTotal: ignored, ...rest } = progress;
      return [id, rest];
    }));
    const projected: Collection = { ...source, characterRanks: {}, characterProgress };
    const estimate = () => {
      const rows = estimateCharacterRanks(master, projected, rules);
      return characters.map(c => {
        const row = rows.find(r => r.id === c.id)!;
        if (row.effectiveRank === null) throw new Error('Missing rank');
        return { ...row, rank: row.effectiveRank };
      });
    };
    const base = estimate();
    let ranks = base.map(r => r.rank);
    let pairs: BondPair[] = characters.flatMap((a, i) => characters.slice(i + 1).map(b => ({ characterA: a.id, characterB: b.id, rank: 1 })));
    const index = new Map(characters.map((c, i) => [c.id, i]));
    // A nonterminal step increases at least one rank, or is the final pair-only
    // update. Ranks can advance only through the imported threshold rows.
    const limit = characters.length * (rules.document.rankThresholds.length - 1) + 2;
    for (let iteration = 1; iteration <= limit; iteration++) {
      const nextPairs = pairs.map(p => ({ ...p, rank: Math.min(ranks[index.get(p.characterA)!]!, ranks[index.get(p.characterB)!]!) }));
      const totals = characters.map(() => 0);
      for (const pair of nextPairs) for (const id of [pair.characterA, pair.characterB]) {
        const i = index.get(id)!;
        totals[i]! += pair.rank;
        if (!Number.isSafeInteger(totals[i])) throw new Error('Unsafe bond total');
      }
      characters.forEach((c, i) => { characterProgress[c.id] = { ...characterProgress[c.id], bondRankTotal: totals[i]! }; });
      const nextRanks = estimate().map(r => r.rank);
      if (nextRanks.some((rank, i) => rank < ranks[i]!) || nextPairs.some((p, i) => p.rank < pairs[i]!.rank)) throw new Error('Nonmonotone projection');
      if (nextRanks.every((rank, i) => rank === ranks[i]) && nextPairs.every((p, i) => p.rank === pairs[i]!.rank)) {
        return { status: 'ready', pairs: nextPairs, iterations: iteration, characters: characters.map((c, i) => ({
          id: c.id, baseRank: base[i]!.rank, finalRank: nextRanks[i]!, bondRankTotal: totals[i]!,
          missingProgress: base[i]!.missingProgress.filter(key => key !== 'bondRankTotal'),
        })) };
      }
      ranks = nextRanks;
      pairs = nextPairs;
    }
    return { status: 'pending', reason: 'マスタに基づく反復上限内で収束しませんでした。定義を確認してください。' };
  } catch {
    // Do not expose imported data in diagnostics or return partial numeric results.
    return { status: 'pending', reason: 'マスタ・所持・進捗が不正または定義が不一致のため、理論値は未算出です。' };
  }
}
