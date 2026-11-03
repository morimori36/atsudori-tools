import { maximumTrainingFixture } from './maximum-training';
import type { TrainingSettings } from '../../src/app/hypothetical-training';
export const inventoryTraining:TrainingSettings={trainingStage:2,awakeningStage:2,liveSkillLevel:2,gekisouSkillLevel:null,snapRank:2};
export function inventoryFixture() {
  const {m,c}=maximumTrainingFixture();
  m.materialDefinition!.schedules.find(s=>s.id==='rank')!.stages[1]!.amounts.push({resourceId:'paper',quantity:5});
  m.materialDefinition!.resources.push({id:'retired',name:'架空の保管紙',unit:'item'});
  return {m,c};
}
