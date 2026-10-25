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
  liveSkillLevels: number[];
  gekisouSkillLevels: number[];
}
export interface SnapMaster {
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
export interface BandItemMaster { id: number; bandId: number; name: string }
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
export interface Masterdata {
  /** Static progression definitions and total-rank bonus table, supplied with this catalog. */
  rankDefinition?: RankDefinition;
  schemaVersion: 1;
  format: 'atsudori-tools/catalog';
  catalogId: string;
  revision: string;
  members: MemberMaster[];
  snaps: SnapMaster[];
  characters: { id: number; bandId: number; name: string }[];
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
