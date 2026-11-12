import {calculateKnownMonthlyPlan} from './calculate';
import type {StarBudgetInput} from './model';
import type {GachaKind, SealBudgetDefinition} from '../seal-budget/model';

/** Same resolved draws as seal income; free pass benefits add no star cost. */
export function calculatePlannedStars(input: StarBudgetInput, sealDefinition: SealBudgetDefinition,
  paidDraws: {id: GachaKind; quantity: number; periodDays: number}[]) {
  const notes = new Set<string>();
  const expenses = paidDraws.flatMap(draw => {
    if (draw.quantity === 0) return [];
    const g = sealDefinition.gachas.find(g => g.id === draw.id)!;
    if (g.paidStarsPerDraw === null) {
      notes.add(g.name + 'の有償スター費用は未確認のため除外');
      return [];
    }
    return [{quantity: draw.quantity, periodDays: draw.periodDays, cost: g.paidStarsPerDraw}];
  });
  const {reasons, ...result} = calculateKnownMonthlyPlan(input, expenses);
  for (const reason of reasons) notes.add(reason + '（未確認の寄与を除外）');
  const compatible = input.definition.starCompatibility === 'assumed-usable' || input.definition.starCompatibility === 'confirmed-usable';
  if (!compatible) notes.add('カタログ支払時のスター利用条件が未確認、または利用制約があります');
  return {...result, notes: [...notes], compatible};
}
