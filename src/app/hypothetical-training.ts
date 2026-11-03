import { applyTrainingConditions, KEEP_TRAINING } from './training-conditions';
import type { TrainingConditions } from './training-conditions';
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
/** Explicit v1 adapter: absent axes stay fixed; Lv changes only when training rises. */
export function legacyTrainingConditions(supplied: TrainingSettings): TrainingConditions {
  const settings = validateTrainingSettings(supplied);
  return {member:{...settings,level:'maxIfTrainingRaised'},snap:{...KEEP_TRAINING.snap}};
}
/** Rating and JSON export retain their current-rank semantics at their callers. */
export function applyHypotheticalTraining(master: Masterdata, collection: Collection, supplied: TrainingSettings): Collection {
  return applyTrainingConditions(master, collection, legacyTrainingConditions(supplied));
}
