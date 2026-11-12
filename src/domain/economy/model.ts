import type { MaterialAmount } from '../materials/model';

export interface Ratio { numerator: number; denominator: number }
export type Destination = 'inventory' | 'direct' | 'entitlement';
export interface Grant extends MaterialAmount { destination: Destination }
export interface Unavailable { reason: string; resourceIds: string[]; destination?: Destination }
/** An empty lottery outcome explicitly represents a miss. All weights must sum to totalWeight. */
export interface Lottery { draws: Ratio; totalWeight: number; outcomes: { weight: number; rewards: Grant[] }[] }
export interface Rewards { fixed: Grant[]; lotteries: Lottery[]; unavailable: Unavailable[] }
export interface Named { id: string; name: string; basis: string }
export interface LiveSupply extends Named {
  mode: 'play' | 'skip'; scoreRank: string; lbMultiplier: number; perLb: Rewards; perPlay: Rewards;
}
export interface StudioSupply {
  bandId: number; level: number; tickMinutes: number; normalMinutes: number; capMinutes: number | null;
  rewardScale: Ratio;
  overflowRate: Ratio | null; rounding: 'claim' | 'tick' | null;
  lotteryRounding: 'floor' | 'fractional' | null; rewards: Rewards; basis: string;
}
export interface RankSupply { rank: number; studioMultiplier: Ratio | null; daily: Rewards | null }
export interface StandardEvent { intervalDays: number; basis: string; cumulative: Rewards; limited: Rewards }
export interface FixedSupply extends Named {
  intervalDays: Ratio | null;
  rewards: Rewards;
}
/** All resource IDs refer to materialDefinition; types never imply conversion between IDs. */
export interface SupplyDefinition {
  schemaVersion: 4;
  catalogRevision: string; revision: string; basis: string;
  currencies: string[]; lives: LiveSupply[]; studios: StudioSupply[]; ranks: RankSupply[];
  standardEvent: StandardEvent | null; fixedSources: FixedSupply[];
  unavailable: Unavailable[];
}
/** User conditions only; rank and Premium purchases belong to the shared collection. */
export interface SupplyConditions {
  lbPerDay: number;
  scoreRank: string | null;
  studioLevels: { bandId: number; level: number }[];
}
export const defaultSupplyConditions = (): SupplyConditions => ({ lbPerDay: 0, scoreRank: null, studioLevels: [] });
export type Certainty = 'confirmed' | 'expected' | 'estimated';
export interface DailySupplyEntry {
  sourceId: string; sourceName: string; basis: string; resourceId: string;
  destination: Destination; certainty: Certainty; dailyQuantity: number;
}
export interface EconomyIssue { sourceId: string; reason: string; resourceIds: string[]; blocksProjection: boolean }
