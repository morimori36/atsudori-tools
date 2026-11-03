import type { Masterdata } from '../data/catalog/model';
import { validateCollection } from '../storage/collection';
import type { Collection } from '../storage/collection';
import { calculateMaterialRequirementsToTarget } from '../domain/materials/calculate';
import type { CardRequirement } from '../domain/materials/calculate';
import type { MaterialAmount } from '../domain/materials/model';
import { applyTrainingConditions } from './training-conditions';
import type { TrainingConditions } from './training-conditions';
import { estimateCharacterRanks, sumCharacterRanks } from '../domain/character-rank/estimate';
import { estimateBondRankTheory } from '../domain/character-rank/bond-theory';
import type { BondTheoryResult } from '../domain/character-rank/bond-theory';
import { trainingConditions } from './hypothetical-training';
import type { TrainingSettings } from './hypothetical-training';
import { resolveTotalRankBonus } from '../domain/character-rank/bonus';
import { catalogRankRules } from '../domain/character-rank/rules';
import { requireInteger } from '../domain/rating/calculate';
import { evaluateCollection, summarizeBands } from './evaluate-collection';

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

export function simulateTraining(master: Masterdata, input: Collection, conditions: TrainingConditions, options = { bondTheory: false }) {
  const current = validateCollection(input, master);
  const target = applyTrainingConditions(master, current, conditions);
  const materials = calculateMaterialRequirementsToTarget(master, current, target);
  const rules = catalogRankRules(master);
  // Scoped to this exact target. No theory cache survives conditions, ownership or catalog changes.
  const theories = new Map<number,BondTheoryResult>();
  const bondTheory = (bandId:number) => {
    if (!theories.has(bandId)) theories.set(bandId,trainingBondTheory(master,target,bandId));
    return theories.get(bandId)!;
  };
  const snapshot = (collection: Collection, theory = false) => {
    const ranks = estimateCharacterRanks(master, collection, rules).map(row => {
      if (!theory) return row;
      const bandId = master.characters.find(c=>c.id===row.id)!.bandId;
      const result = bondTheory(bandId);
      const effectiveRank = result.status === 'ready' ? result.characters.find(c=>c.id===row.id)!.finalRank : null;
      return {...row,effectiveRank,reason:result.status==='pending'?`絆理論値は保留：${result.reason}`:null};
    });
    const colors = evaluateCollection(master, collection, collection, rules, ranks);
    const bands = summarizeBands(colors);
    const rating = bands.length && bands.every(b => b.rating !== null) ? bands.reduce((n, b) => n + b.rating!, 0) : null;
    if (rating !== null) requireInteger(rating, 'rating total');
    return { ranks, colors, bands, rating, totalRank: sumCharacterRanks(ranks), bonus: resolveTotalRankBonus(ranks, collection, rules) };
  };
  const before = snapshot(current), after = snapshot(target, options.bondTheory);
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
        // Ordinary comparisons keep manual ranks distinct; theory compares the two displayed effective ranks.
        rankDelta: (!options.bondTheory && from.overrideRank !== undefined) || from.effectiveRank === null || to.effectiveRank === null ? null : to.effectiveRank - from.effectiveRank };
    });
    const cards = characters.flatMap(c => c.cards);
    return { ...band, characters, materials: summarizeMaterialCards(cards),
      before: before.bands.find(b => b.bandId === band.id), after: after.bands.find(b => b.bandId === band.id) };
  });
  const snaps = materials.cards.filter(c => c.kind === 'snap');
  return { current, target, materials, before, after, bands, snaps, snapMaterials: summarizeMaterialCards(snaps),
    bondTheory };
}

/** Shared evaluation scenario for both rating and materials pages. Export deliberately does not call this. */
export function simulateTrainingEvaluation(master:Masterdata, input:Collection, settings:TrainingSettings) {
  return simulateTraining(master,input,trainingConditions(settings),{bondTheory:true});
}

/** Reuse the existing iterative domain calculation without duplicating its rules. */
export function trainingBondTheory(master: Masterdata, target: Collection, bandId: number) {
  return estimateBondRankTheory(master, target, bandId);
}
