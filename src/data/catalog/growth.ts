import { requireInteger } from '../../domain/rating/calculate';
import type { Stats } from '../../domain/rating/calculate';
import type { Masterdata } from './model';

export interface MemberProgression {
  cardId: number;
  level: number;
  trainingStage: number;
  awakeningStage: number;
}
export interface SnapProgression { supportCardId: number; level: number; rank: number }
const channels = ['performance', 'technic', 'visual'] as const;

// Unlike the rating formula, the game-common display conversion uses float32 before separate floors.
function productTerm(max: number, rate: number): number {
  requireInteger(max, 'max');
  requireInteger(rate, 'rate');
  if (!Number.isSafeInteger(max * rate) || max * rate > 2147483647) {
    throw new RangeError('growth product outside the supported numeric domain');
  }
  return Math.floor(Math.fround(Math.fround(max * rate) / 10000));
}
function trainingTerm(max: number, rate: number): number {
  requireInteger(max, 'max');
  requireInteger(rate, 'rate');
  return Math.floor(Math.fround(Math.fround(Math.fround(rate) / 10000) * Math.fround(max)));
}

export function deriveMemberDisplay(master: Masterdata, owned: MemberProgression): {
  displayedStats: Stats; awakeLevel: number; limitLevel: number;
} {
  for (const key of ['cardId', 'level', 'trainingStage', 'awakeningStage'] as const) requireInteger(owned[key], key, 1);
  const card = master.members.find(r => r.id === owned.cardId);
  if (!card) throw new Error(`unknown member ${owned.cardId}`);
  const level = master.memberLevels.find(r => r.group === card.levelGroup && r.level === owned.level);
  const training = master.memberTraining.find(r => r.group === card.trainingGroup && r.stage === owned.trainingStage);
  const awakening = master.memberAwakening.find(r => r.group === card.awakeningGroup && r.stage === owned.awakeningStage);
  const limit = master.memberLevelLimits.find(r => r.rarity === card.rarity && r.trainingStage === owned.trainingStage);
  if (!level || !training || !awakening || !limit) throw new Error(`member ${card.id}: missing growth row`);
  if (owned.level > limit.limitLevel) throw new Error(`member ${card.id}: level exceeds training cap ${limit.limitLevel}`);
  if (awakening.leaderSkillLevel !== owned.awakeningStage) throw new Error('unverified awakening/leader/A linkage');
  const displayedStats = {} as Record<keyof Stats, number>;
  for (const key of channels) {
    displayedStats[key] = productTerm(card.maxStats[key], level.rates[key])
      + trainingTerm(card.maxStats[key], training.rates[key])
      + productTerm(card.maxStats[key], awakening.rates[key]);
  }
  return { displayedStats, awakeLevel: awakening.leaderSkillLevel, limitLevel: limit.limitLevel };
}

export function deriveSnapDisplay(master: Masterdata, owned: SnapProgression): {
  percentBp: Stats; snapLimitBreak: number; limitLevel: number;
} {
  for (const key of ['supportCardId', 'level', 'rank'] as const) requireInteger(owned[key], key, 1);
  const snap = master.snaps.find(r => r.id === owned.supportCardId);
  if (!snap) throw new Error(`unknown Snap ${owned.supportCardId}`);
  const level = master.snapLevels.find(r => r.group === snap.levelGroup && r.level === owned.level);
  const rank = master.snapRanks.find(r => r.group === snap.rankGroup && r.rank === owned.rank);
  if (!level || !rank) throw new Error(`Snap ${snap.id}: missing growth row`);
  if (owned.level > rank.limitLevel) throw new Error(`Snap ${snap.id}: level exceeds rank cap ${rank.limitLevel}`);
  if (!rank.supportSkillLevels.every(l => l === owned.rank)) throw new Error('unverified Snap rank/support/U linkage');
  return {
    percentBp: {
      performance: productTerm(snap.maxPercentBp.performance, level.rates.performance),
      technic: productTerm(snap.maxPercentBp.technic, level.rates.technic),
      visual: productTerm(snap.maxPercentBp.visual, level.rates.visual),
    },
    snapLimitBreak: owned.rank, limitLevel: rank.limitLevel,
  };
}

/** Missing entries are unknown; null is explicitly unowned, never game level zero. */
export function deriveBandItemRate(
  master: Masterdata, bandId: number, states: Readonly<Record<string, number | null>>,
): { status: 'resolved'; tenthPercent: number } | { status: 'unresolved'; missingItemIds: number[] } {
  const items = master.bandItems.filter(r => r.bandId === bandId);
  if (!master.bands.some(r => r.id === bandId) || items.length === 0) throw new Error(`unknown band ${bandId}`);
  const missingItemIds = items.filter(r => states[r.id] === undefined).map(r => r.id);
  if (missingItemIds.length) return { status: 'unresolved', missingItemIds };
  let totalBp = 0;
  for (const item of items) {
    const level = states[item.id];
    if (level === null) continue;
    requireInteger(level!, 'item level', 1);
    if (!master.bandItemLevels.some(r => r.itemId === item.id && r.level === level)) {
      throw new Error(`item ${item.id}: illegal owned level ${level}`);
    }
    const effect = master.bandItemEffects.find(r => r.itemId === item.id && r.level === level);
    const target = master.skillTargets.find(r => r.id === effect?.targetIds[0]);
    if (!effect || effect.effectType !== 1000 || effect.targetIds.length !== 1 || !target
      || target.targetType !== 3 || target.bandId !== bandId
      || target.characterId !== 0 || target.cardType !== 0 || target.tagId !== 0) {
      throw new Error(`item ${item.id}: unverified effect target`);
    }
    totalBp += effect.valueBp;
    requireInteger(totalBp, 'total item rate');
  }
  if (totalBp % 10 !== 0) throw new Error('item rate cannot be represented in verified tenth-percent units');
  return { status: 'resolved', tenthPercent: totalBp / 10 };
}
