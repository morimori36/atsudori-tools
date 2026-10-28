import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import { applyHypotheticalTraining, DEFAULT_TRAINING } from './hypothetical-training';
import type { TrainingSettings } from './hypothetical-training';

export function potentialCollection(master: Masterdata, collection: Collection, settings: TrainingSettings = DEFAULT_TRAINING): Collection {
  return applyHypotheticalTraining(master,collection,settings);
}
