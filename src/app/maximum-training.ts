import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { applyTrainingConditions, MAXIMUM_TRAINING } from './training-conditions';
import { simulateTraining } from './training-simulation';
export { summarizeMaterialCards, trainingBondTheory as maximumTrainingBondTheory } from './training-simulation';

/** Compatibility entry points: no-copy maximum training is a common-model preset. */
export function maximumTrainingTarget(master: Masterdata, input: Collection): Collection {
  return applyTrainingConditions(master, input, MAXIMUM_TRAINING);
}
export function simulateMaximumTraining(master: Masterdata, input: Collection) {
  return simulateTraining(master, input, MAXIMUM_TRAINING);
}
