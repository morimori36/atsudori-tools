import { applyTrainingConditions, KEEP_TRAINING } from './training-conditions';
import type { TrainingConditions } from './training-conditions';
import type { Masterdata } from '../data/catalog/model';
import type { Collection } from '../storage/collection';

export type TrainingTarget = null | 1 | 2 | 3 | 4 | 5;
export interface TrainingSettings {
  trainingStage: TrainingTarget;
  awakeningStage: TrainingTarget;
  liveSkillLevel: TrainingTarget;
  gekisouSkillLevel: TrainingTarget;
  snapRank: TrainingTarget;
}
export const DEFAULT_TRAINING: Readonly<TrainingSettings> = Object.freeze({trainingStage:5,awakeningStage:null,liveSkillLevel:5,gekisouSkillLevel:5,snapRank:null});
export function validateTrainingSettings(value: unknown): TrainingSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('育成条件が不正です');
  const record = value as Record<string,unknown>;
  const keys = Object.keys(DEFAULT_TRAINING) as (keyof TrainingSettings)[];
  const legacy = !Object.hasOwn(record,'snapRank');
  const required = legacy ? keys.filter(k=>k!=='snapRank') : keys;
  if (Object.keys(record).length !== required.length || required.some(k => !Object.hasOwn(record,k) || ![null,1,2,3,4,5].includes(record[k] as TrainingTarget))) throw new Error('育成条件が不正です');
  return {...Object.fromEntries(required.map(k=>[k,record[k]])),snapRank:legacy?null:record.snapRank} as unknown as TrainingSettings;
}
/** Explicit v1 adapter: absent axes stay fixed; Lv changes only when training rises. */
export function legacyTrainingConditions(supplied: TrainingSettings): TrainingConditions {
  const settings = validateTrainingSettings(supplied);
  const {snapRank:_,...member}=settings;
  return {member:{...member,level:'maxIfTrainingRaised'},snap:{...KEEP_TRAINING.snap}};
}
/** Five UI targets map to the existing seven-axis model; both Lv axes reach their caps. */
export function trainingConditions(supplied: TrainingSettings): TrainingConditions {
  const {snapRank,...member}=validateTrainingSettings(supplied);
  return {member:{...member,level:'max'},snap:{rank:snapRank,level:'max'}};
}
/** State projection only. Rating theory and ordinary export ranks are resolved by callers. */
export function applyHypotheticalTraining(master: Masterdata, collection: Collection, supplied: TrainingSettings): Collection {
  return applyTrainingConditions(master, collection, trainingConditions(supplied));
}
