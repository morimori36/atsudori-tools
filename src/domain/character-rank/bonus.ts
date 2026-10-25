import { requireInteger } from '../rating/calculate';
import { sumCharacterRanks } from './estimate';
import type { Collection } from '../../storage/collection';
import type { BoundRankRules } from './rules';

/** Rank source must be the current collection, including when previewing maximum training. */
export function resolveTotalRankBonus(
  ranks: readonly {effectiveRank:number|null}[], collection: Collection, rules?: BoundRankRules,
): {bonus:number|null;source:'manual'|'rules'|'unknown';reason:string|null} {
  if(collection.totalRankBonus !== undefined) {
    requireInteger(collection.totalRankBonus,'totalRankBonus');
    return {bonus:collection.totalRankBonus,source:'manual',reason:null};
  }
  const total = sumCharacterRanks(ranks);
  if(total === null) return {bonus:null,source:'unknown',reason:'総合ランクが未算出です。各キャラのランクか総合ランクボーナスを設定してください'};
  const row = rules?.document.totalRankBonuses?.slice().reverse().find(row=>row.rank<=total);
  return row ? {bonus:row.bonus,source:'rules',reason:null}
    : {bonus:null,source:'unknown',reason:'総合ランクボーナスを手入力するか、対応するボーナス表を含むマスタをImportしてください'};
}
