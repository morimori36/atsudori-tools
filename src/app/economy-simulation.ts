import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';
import type { TrainingSettings } from './hypothetical-training';
import { trainingConditions } from './hypothetical-training';
import { applyTrainingConditions } from './training-conditions';
import { calculateMaterialRequirementsToTarget } from '../domain/materials/calculate';
import { calculateEconomy } from '../domain/economy/calculate';
import type { EconomyScenario } from '../domain/economy/model';

export function simulateEconomy(master:Masterdata,collection:Collection,settings:TrainingSettings,scenario:EconomyScenario) {
  const target=applyTrainingConditions(master,collection,trainingConditions(settings));
  const requirements=calculateMaterialRequirementsToTarget(master,collection,target);
  return {...calculateEconomy(master,collection.resourceInventory??{},requirements,scenario),trainingSettings:{...settings},
    pendingRequirements:requirements.cards.flatMap(c=>c.axes.filter(a=>a.status==='unavailable').map(a=>({kind:c.kind,cardId:c.cardId,axis:a.axis,reason:a.reason})))};
}
