import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';

export type TrainingTarget = null | 2 | 3 | 4 | 5;
export interface TrainingSettings {
  trainingStage: TrainingTarget;
  awakeningStage: TrainingTarget;
  liveSkillLevel: TrainingTarget;
  gekisouSkillLevel: TrainingTarget;
}
export const DEFAULT_TRAINING: Readonly<TrainingSettings> = Object.freeze({trainingStage:5,awakeningStage:null,liveSkillLevel:5,gekisouSkillLevel:5});
export function validateTrainingSettings(value: unknown): TrainingSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('仮育成設定が不正です');
  const record = value as Record<string,unknown>;
  const keys = Object.keys(DEFAULT_TRAINING) as (keyof TrainingSettings)[];
  if (Object.keys(record).length !== keys.length || keys.some(k => !Object.hasOwn(record,k) || ![null,2,3,4,5].includes(record[k] as TrainingTarget))) throw new Error('仮育成設定が不正です');
  return Object.fromEntries(keys.map(k=>[k,record[k]])) as unknown as TrainingSettings;
}
const raise = (current:number, target:TrainingTarget, legal:number[]) => target === null ? current : Math.max(current,...legal.filter(n=>n<=target));
/** Temporary projection shared by rating and export. Never mutates ownership or catalog. */
export function applyHypotheticalTraining(master:Masterdata, collection:Collection, supplied:TrainingSettings): Collection {
  const settings=validateTrainingSettings(supplied);
  return {...collection,members:collection.members.map(owned=>{
    const card=master.members.find(c=>c.id===owned.cardId);
    if(!card) throw new Error(`unknown member ${owned.cardId}`);
    const trainingStage=raise(owned.trainingStage,settings.trainingStage,master.memberTraining.filter(t=>t.group===card.trainingGroup).map(t=>t.stage));
    let level=owned.level;
    if(trainingStage>owned.trainingStage) {
      const limit=master.memberLevelLimits.find(l=>l.rarity===card.rarity && l.trainingStage===trainingStage);
      if(!limit || !master.memberLevels.some(l=>l.group===card.levelGroup && l.level===limit.limitLevel)) throw new Error(`missing level limit for member ${owned.cardId}`);
      level=limit.limitLevel;
    }
    return {...owned,trainingStage,level,
      awakeningStage:raise(owned.awakeningStage,settings.awakeningStage,master.memberAwakening.filter(a=>a.group===card.awakeningGroup).map(a=>a.stage)),
      liveSkillLevel:raise(owned.liveSkillLevel,settings.liveSkillLevel,card.liveSkillLevels),
      gekisouSkillLevel:raise(owned.gekisouSkillLevel,settings.gekisouSkillLevel,card.gekisouSkillLevels)};
  })};
}
