import type { Masterdata } from '../data/catalog/model';
import { validateCollection } from '../storage/collection';
import type { Collection } from '../storage/collection';
import { calculateMaterialRequirementsToTarget } from '../domain/materials/calculate';
import type { CardRequirement } from '../domain/materials/calculate';
import type { MaterialAmount } from '../domain/materials/model';
import { materialProgression } from '../domain/materials/validate';
import { estimateCharacterRanks, sumCharacterRanks } from '../domain/character-rank/estimate';
import { estimateBondRankTheory } from '../domain/character-rank/bond-theory';
import { resolveTotalRankBonus } from '../domain/character-rank/bonus';
import { catalogRankRules } from '../domain/character-rank/rules';
import { requireInteger } from '../domain/rating/calculate';
import { evaluateCollection, summarizeBands } from './evaluate-collection';

/** A detached calculation model. Ownership, awakening, Snap rank and all manual data stay fixed. */
export function maximumTrainingTarget(master: Masterdata, input: Collection): Collection {
  const target = structuredClone(validateCollection(input, master));
  target.members = target.members.map(owned => {
    const card = master.members.find(c => c.id === owned.cardId)!;
    const maximum = (axis: 'trainingStage' | 'liveSkillLevel' | 'gekisouSkillLevel') => {
      const row = materialProgression(master, 'member', card.id, axis);
      if (!row) throw new Error('Memberの合法的な最大段階を確定できません');
      return row.target;
    };
    const trainingStage = maximum('trainingStage');
    const limit = master.memberLevelLimits.find(r => r.rarity === card.rarity && r.trainingStage === trainingStage);
    if (!limit) throw new Error('Memberの合法Lv上限を確定できません');
    return { ...owned, trainingStage, level: limit.limitLevel,
      liveSkillLevel: maximum('liveSkillLevel'), gekisouSkillLevel: maximum('gekisouSkillLevel') };
  });
  target.snaps = target.snaps.map(owned => {
    const card = master.snaps.find(c => c.id === owned.supportCardId)!;
    const limit = master.snapRanks.find(r => r.group === card.rankGroup && r.rank === owned.rank);
    if (!limit) throw new Error('Snapの合法Lv上限を確定できません');
    return { ...owned, level: limit.limitLevel };
  });
  return validateCollection(target, master);
}

/** Grouping is an accounting view of the global scenario, never a new training scenario. */
export function summarizeMaterialCards(cards: readonly CardRequirement[]) {
  const totals = new Map<string, number>();
  for (const card of cards) for (const amount of card.amounts) {
    const n = (totals.get(amount.resourceId) ?? 0) + amount.quantity;
    requireInteger(n, 'material total');
    totals.set(amount.resourceId, n);
  }
  return { totals: [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([resourceId, quantity]): MaterialAmount => ({ resourceId, quantity })),
    incomplete: cards.some(c => c.axes.some(a => a.status === 'unavailable')) };
}

export function simulateMaximumTraining(master: Masterdata, input: Collection) {
  const current = validateCollection(input, master);
  const target = maximumTrainingTarget(master, current);
  const materials = calculateMaterialRequirementsToTarget(master, current, target);
  const rules = catalogRankRules(master);
  const snapshot = (collection: Collection) => {
    const ranks = estimateCharacterRanks(master, collection, rules);
    const colors = evaluateCollection(master, collection, collection, rules);
    const bands = summarizeBands(colors);
    const rating = bands.length && bands.every(b => b.rating !== null) ? bands.reduce((n, b) => n + b.rating!, 0) : null;
    if (rating !== null) requireInteger(rating, 'rating total');
    return { ranks, colors, bands, rating, totalRank: sumCharacterRanks(ranks), bonus: resolveTotalRankBonus(ranks, collection, rules) };
  };
  const before = snapshot(current), after = snapshot(target);
  const memberCharacters = new Map(master.members.map(m => [m.id, m.characterId]));
  const characterCards = new Map<number, CardRequirement[]>();
  for (const card of materials.cards) if (card.kind === 'member') {
    const id = memberCharacters.get(card.cardId)!;
    if (!characterCards.has(id)) characterCards.set(id, []);
    characterCards.get(id)!.push(card);
  }
  const bands = master.bands.map(band => {
    const characters = master.characters.filter(c => c.bandId === band.id).map(character => {
      const from = before.ranks.find(r => r.id === character.id)!, to = after.ranks.find(r => r.id === character.id)!;
      const cards = characterCards.get(character.id) ?? [];
      return { ...character, before: from, after: to, cards, materials: summarizeMaterialCards(cards),
        // Manual ranks describe actual progress. Do not claim an automatic growth delta for them.
        rankDelta: from.overrideRank !== undefined || from.estimatedRank === null || to.estimatedRank === null ? null : to.estimatedRank - from.estimatedRank };
    });
    const cards = characters.flatMap(c => c.cards);
    return { ...band, characters, materials: summarizeMaterialCards(cards),
      before: before.bands.find(b => b.bandId === band.id), after: after.bands.find(b => b.bandId === band.id) };
  });
  const snaps = materials.cards.filter(c => c.kind === 'snap');
  return { current, target, materials, before, after, bands, snaps, snapMaterials: summarizeMaterialCards(snaps) };
}

/** Expensive iterative theory is requested separately for the band being inspected. */
export function maximumTrainingBondTheory(master: Masterdata, target: Collection, bandId: number) {
  return estimateBondRankTheory(master, target, bandId);
}
