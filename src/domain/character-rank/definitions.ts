/** Stable storage keys and supported operations only. No achievement or rank data is bundled. */
export const manualProgressKeys = ['stamps','songClears','bondRankTotal','liveClears'] as const;
export type ManualProgressKey = typeof manualProgressKeys[number];
export type SkillMetric = `skillLevel${2 | 3 | 4 | 5}`;
/** Legacy skill progress is preserved, never used for estimation. */
export const storedProgressFields = Object.fromEntries([...manualProgressKeys,'skillLevel2','skillLevel3','skillLevel4','skillLevel5'].map(key=>[key,key]));
export type CharacterProgress = Partial<Record<ManualProgressKey | SkillMetric,number>>;
export type AchievementMetric = 'members' | 'snaps' | 'training' | 'awakening' | 'snapRank' | 'skills' | ManualProgressKey;
export interface AchievementDefinition {
  id: string;
  kind: AchievementMetric;
  label: string;
  stage: number | null;
  thresholds: number[];
  exp: number;
}

/** Static data embedded in catalog; no second catalog binding or dynamic progress. */
export interface RankDefinition {
  engine: 'achievement-thresholds/1';
  id: string;
  version: string;
  provenance: {sources:{id:string;revision:string;sha256:string}[]};
  manualProgress: {key:ManualProgressKey;label:string}[];
  achievements: AchievementDefinition[];
  rankThresholds: {rank:number;exp:number}[];
  totalRankBonuses?: {rank:number;bonus:number}[];
}
