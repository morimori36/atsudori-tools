import { estimateCharacterRanks } from '../domain/character-rank/estimate';
import { calculateRating, requireInteger } from '../domain/rating/calculate';
import type { RatingBreakdown, RatingInput } from '../domain/rating/calculate';
import { selectByColor } from '../domain/selection/select';
import type { SelectedSlot } from '../domain/selection/select';
import { deriveMemberDisplay, deriveSnapDisplay, deriveBandItemRate } from '../data/catalog/growth';
import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import type { BoundRankRules } from '../domain/character-rank/rules';

export interface EvaluatedSlot {
  selection: SelectedSlot;
  status: 'calculated' | 'pending';
  reasons: string[];
  input?: RatingInput;
  result?: RatingBreakdown;
  displaySource?: 'growth';
}
export interface EvaluatedColor {
  bandId: number;
  cardType: number;
  slots: EvaluatedSlot[];
  /** A subset is never presented as a completed color rating. */
  subtotal: number;
  rating: number | null;
  provisional: boolean;
}
export interface EvaluatedBand {
  bandId: number;
  colors: EvaluatedColor[];
  subtotal: number;
  rating: number | null;
  provisional: boolean;
}
/** Aggregate calculated slots; a pending color never becomes a completed band total. */
export function summarizeBands(colors: readonly EvaluatedColor[]): EvaluatedBand[] {
  return [...new Set(colors.map(c => c.bandId))].sort((a, b) => a - b).map(bandId => {
    const matching = colors.filter(c => c.bandId === bandId).sort((a, b) => a.cardType - b.cardType);
    const subtotal = matching.reduce((sum, c) => sum + c.subtotal, 0);
    requireInteger(subtotal, 'band total');
    return { bandId, colors: matching, subtotal,
      rating: matching.every(c => c.rating !== null) ? subtotal : null,
      provisional: matching.some(c => c.provisional) };
  });
}
export function evaluateCollection(master: Masterdata, collection: Collection, rankSource: Collection = collection, rules?: BoundRankRules): EvaluatedColor[] {
  const ranks=estimateCharacterRanks(master,rankSource,rules);
  const members = collection.members.map(owned => {
    const row = master.members.find(m => m.id === owned.cardId);
    if (!row) throw new Error(`unknown member ${owned.cardId}`);
    const character = master.characters.find(c => c.id === row.characterId);
    if (!character) throw new Error(`unknown character ${row.characterId}`);
    return { id: row.id, bandId: character.bandId, characterId: row.characterId, cardType: row.cardType, rarity: row.rarity };
  });
  const snaps = collection.snaps.map(owned => {
    const row = master.snaps.find(s => s.id === owned.supportCardId);
    if (!row) throw new Error(`unknown Snap ${owned.supportCardId}`);
    return { id: row.id, characterIds: row.characterIds, cardType: row.cardType, rarity: row.rarity };
  });
  return selectByColor(members, snaps).map(color => {
    const slots = color.slots.map((selection): EvaluatedSlot => {
      const reasons: string[] = [];
      if (selection.member.status === 'ambiguous') reasons.push('メンバーの同枠候補を確定できません');
      if (selection.snap.status === 'ambiguous') reasons.push('Snapの同枠候補を確定できません');
      if (selection.issues.length) reasons.push('共有Snapの候補メンバーに未確認のレアリティ順序があります');
      if (selection.status !== 'resolved' || selection.member.status !== 'selected') {
        return { selection, status: 'pending', reasons };
      }
      // Read the selected metadata by its validated identity, never from imported derived fields.
      const candidate = selection.member.candidate;
      const character = master.characters.find(c => c.id === candidate.characterId)!;
      const owned = collection.members.find(m => m.cardId === candidate.id)!;
      const resolvedRank = ranks.find(r=>r.id===character.id)!;
      const rank=resolvedRank.effectiveRank;
      if(rank===null)reasons.push(resolvedRank.reason!);
      const item = deriveBandItemRate(master, character.bandId, collection.bandItems);
      if (item.status === 'unresolved') reasons.push('対象バンドのアイテムに未設定があります');
      if (reasons.length || item.status !== 'resolved' || rank===null) return { selection, status: 'pending', reasons };
      const member = deriveMemberDisplay(master, owned);
      const selectedSnap = selection.snap.status === 'selected' ? selection.snap.candidate.id : undefined;
      const snapDisplay = selectedSnap === undefined ? undefined
        : deriveSnapDisplay(master, collection.snaps.find(s => s.supportCardId === selectedSnap)!);
      const input: RatingInput = {
        memberDisplayedStats: member.displayedStats,
        awakeLevel: member.awakeLevel, liveSkillLevel: owned.liveSkillLevel,
        gekisouSkillLevel: owned.gekisouSkillLevel, characterRank: rank,
        bandItemTenthPercent: item.tenthPercent,
        snapPercentBp: snapDisplay?.percentBp ?? { performance: 0, technic: 0, visual: 0 },
        snapLimitBreak: snapDisplay?.snapLimitBreak ?? 0,
      };
      try {
        return { selection, status: 'calculated', reasons, input, result: calculateRating(input),
          displaySource: 'growth' };
      } catch (error) {
        return { selection, status: 'pending', reasons: [`計算入力を確認してください（${error instanceof Error ? error.message : String(error)}）`] };
      }
    });
    const subtotal = slots.reduce((sum, s) => sum + (s.result?.bandRating ?? 0), 0);
    requireInteger(subtotal, 'color total');
    const provisional = color.slots.some(s => s.notices.length > 0 || (s.member.status === 'selected' && s.member.provisional)
      || (s.snap.status === 'selected' && s.snap.provisional));
    return { bandId: color.bandId, cardType: color.cardType, slots, subtotal,
      rating: slots.every(s => s.status === 'calculated') ? subtotal : null, provisional };
  });
}
