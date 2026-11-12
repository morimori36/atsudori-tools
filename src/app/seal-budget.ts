import type {Masterdata} from '../data/catalog/model';
import {validateCollection} from '../storage/collection';
import type {Collection} from '../storage/collection';
import {calculatePlannedSeals} from '../domain/seal-budget/plan';
import {calculatePlannedStars} from '../domain/star-budget/plan';
import {defaultStarBudgetScenario} from '../domain/star-budget/model';
import {defaultSealBudgetScenario} from '../domain/seal-budget/model';
import type {SealBudgetScenario} from '../domain/seal-budget/model';
import {sealBudgetIssues} from '../domain/seal-budget/validate';

/** Read only: reuse the registered collection; never save a second ownership snapshot. */
export function calculateCollectionSealBudget(master: Masterdata, collection: Collection | null, scenario?: SealBudgetScenario) {
  return calculateCollectionBudgetPlan(master, collection, scenario).seals;
}

export function calculateCollectionBudgetPlan(master: Masterdata, collection: Collection | null, scenario?: SealBudgetScenario) {
  if (!master.sealBudgetDefinition) throw new Error('シール予算定義を含むマスタを登録してください');
  if (sealBudgetIssues(master).length) throw new Error('シール予算: カード・育成定義の参照が不正です');
  const validated = collection === null ? null : validateCollection(collection, master);
  const starScenario = validated?.starBudgetScenario ?? defaultStarBudgetScenario();
  const planned = calculatePlannedSeals(master.sealBudgetDefinition,
    scenario ?? validated?.sealBudgetScenario ?? defaultSealBudgetScenario(), starScenario.passPlan ?? 'none', validated);
  const stars = master.starBudgetDefinition ? calculatePlannedStars({definition: master.starBudgetDefinition,
    scenario: {...starScenario, rank: validated?.tgwRank ?? null}}, master.sealBudgetDefinition, planned.paidDraws) : null;
  const notes = [...new Set([...planned.seals.notes, ...(stars?.notes ?? ['スター予算定義が未登録のためスター収支は未確認'])])];
  const status: 'unavailable' | 'shortfall' | 'paid-shortfall' | 'unconfirmed' | 'seal-shortfall' | 'sustainable' = planned.unavailable ? 'unavailable' : stars && stars.balance < 0 ? 'shortfall'
    : stars && stars.paidBalance < 0 ? 'paid-shortfall'
      : notes.length || !stars?.compatible ? 'unconfirmed'
        : planned.seals.balance < 0 ? 'seal-shortfall' : 'sustainable';
  return {...planned, stars, notes, status};
}
