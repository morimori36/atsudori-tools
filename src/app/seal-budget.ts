import type {Masterdata} from '../data/catalog/model';
import {validateCollection} from '../storage/collection';
import type {Collection} from '../storage/collection';
import {calculateSealBudget} from '../domain/seal-budget/calculate';
import {defaultSealBudgetScenario} from '../domain/seal-budget/model';
import type {SealBudgetScenario} from '../domain/seal-budget/model';
import {sealBudgetIssues} from '../domain/seal-budget/validate';

/** Read only: reuse the registered collection; never save a second ownership snapshot. */
export function calculateCollectionSealBudget(master: Masterdata, collection: Collection | null, scenario?: SealBudgetScenario) {
  if (!master.sealBudgetDefinition) throw new Error('シール予算定義を含むマスタを登録してください');
  if (sealBudgetIssues(master).length) throw new Error('シール予算: カード・育成定義の参照が不正です');
  const validated = collection === null ? null : validateCollection(collection, master);
  return calculateSealBudget(master.sealBudgetDefinition, scenario ?? validated?.sealBudgetScenario ?? defaultSealBudgetScenario(), validated);
}
