import type { RankDefinition } from '../../domain/character-rank/definitions';
import type { Stats } from '../../domain/rating/calculate';

export interface MemberMaster {
  id: number;
  characterId: number;
  cardType: number;
  rarity: number;
  name: string;
  title: string;
  maxStats: Stats;
  levelGroup: number;
  trainingGroup: number;
  awakeningGroup: number;
  liveSkillCategoryIds?: number[];
  gekisouSkillCategoryIds?: number[];
  liveSkillLevels: number[];
  gekisouSkillLevels: number[];
}
export interface SnapMaster {
  supportSkillCategoryIds?: number[];
  gekisouSupportSkillCategoryIds?: number[];
  id: number;
  characterIds: number[];
  cardType: number;
  rarity: number;
  name: string;
  title: string;
  maxPercentBp: Stats;
  levelGroup: number;
  rankGroup: number;
}
export interface LevelRate { group: number; level: number; rates: Stats }
export interface TrainingRate { group: number; stage: number; rates: Stats }
export interface AwakeningRate extends TrainingRate { leaderSkillLevel: number }
export interface SnapRank {
  group: number;
  rank: number;
  limitLevel: number;
  supportSkillLevels: [number, number];
}
export interface BandItemMaster { id: number; bandId: number; name: string; displayOrder?: number }
export interface BandItemLevel { itemId: number; level: number }
export interface BandItemEffect extends BandItemLevel {
  effectType: number;
  valueBp: number;
  targetIds: number[];
}
export interface SkillTarget {
  id: number;
  targetType: number;
  bandId: number;
  characterId: number;
  cardType: number;
  tagId: number;
}
export interface CharacterMaster { id: number; bandId: number; name: string; displayOrder?: number }
export interface StampMaster { id: number; name: string; characterIds: number[] }
export type SkillKind = 'live' | 'gekisou' | 'support' | 'gekisouSupport';
export interface SkillCategory { id: number; kind: SkillKind; name: string }
export interface Masterdata {
  skillCategories?: SkillCategory[];
  /** Final per-character counts supplied by the catalog producer. */
  songClearCounts?: Record<string, number>;
  stamps?: StampMaster[];
  materialDefinition?: import('../../domain/materials/model').MaterialDefinition;
  starBudgetDefinition?: import('../../domain/star-budget/model').StarBudgetDefinition;
  supplyDefinition?: import('../../domain/economy/model').SupplyDefinition;
  /** Static progression definitions and total-rank bonus table, supplied with this catalog. */
  rankDefinition?: RankDefinition;
  schemaVersion: 1;
  format: 'atsudori-tools/catalog';
  catalogId: string;
  revision: string;
  members: MemberMaster[];
  snaps: SnapMaster[];
  characters: CharacterMaster[];
  bands: { id: number; name: string }[];
  characterRankLevels: number[];
  memberLevels: LevelRate[];
  memberTraining: TrainingRate[];
  memberAwakening: AwakeningRate[];
  memberLevelLimits: { rarity: number; trainingStage: number; limitLevel: number }[];
  snapLevels: LevelRate[];
  snapRanks: SnapRank[];
  bandItems: BandItemMaster[];
  bandItemLevels: BandItemLevel[];
  bandItemEffects: BandItemEffect[];
  skillTargets: SkillTarget[];
}
