import type { MaterialAmount } from '../materials/model';

export interface Ratio { numerator: number; denominator: number }
export type Destination = 'inventory' | 'direct' | 'entitlement';
export interface Grant extends MaterialAmount { destination: Destination }
export interface Unavailable { reason: string; resourceIds: string[]; destination?: Destination }
/** An empty lottery outcome explicitly represents a miss. All weights must sum to totalWeight. */
export interface Lottery { draws: Ratio; totalWeight: number; outcomes: { weight: number; rewards: Grant[] }[] }
export interface Rewards { fixed: Grant[]; lotteries: Lottery[]; unavailable: Unavailable[] }
export interface Reset { kind: 'once' | 'daily' | 'weekly' | 'monthly'; hour: number; weekday?: number; day?: number }
export interface Window { startsAt: string; endsAt: string }
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
export interface EventSupply extends Named, Window {
  milestones: { points: number; excludeOnFullCollection: boolean; rewards: Rewards }[];
  repeat: { startsAfter: number; everyPoints: number; rewards: Rewards } | null;
}
export interface Offer extends Named {
  scope: 'catalog' | 'seal' | 'event' | 'other'; eventId?: string;
  minimumRank: number | null; costs: MaterialAmount[]; rewards: Rewards;
  limit: number | null; reset: Reset; window: Window | null;
}
export interface PassSupply extends Named {
  durationDays: number; priceYen: number; purchase: Rewards; daily: Rewards;
  weekly: Rewards; weeklyReset: Reset | null; eventDaily: Rewards; features: string[];
}
export interface FixedSupply extends Named {
  category: 'permanent' | 'oneTime' | 'paid'; reset: Reset; window: Window | null;
  rewards: Rewards; priceYen: number;
}
/** All resource IDs refer to materialDefinition; types never imply conversion between IDs. */
export interface SupplyDefinition {
  catalogRevision: string; revision: string; basis: string; utcOffsetMinutes: number;
  currencies: string[]; lives: LiveSupply[]; studios: StudioSupply[]; ranks: RankSupply[];
  events: EventSupply[]; offers: Offer[]; passes: PassSupply[]; fixedSources: FixedSupply[];
  unavailable: Unavailable[];
  eventCoverage?: Window;
}
export interface EconomyScenario {
  format: 'atsudori-tools/economy-scenario'; schemaVersion: 1; catalogId: string;
  startDate: string; endDate: string; rank: number | null;
  live: { enabled: boolean; lbPerDay: number; skipPercent: number; playId: string | null; skipId: string | null;
    playsPerDay: number | null; skipsPerDay: number | null };
  studio: { enabled: boolean; levels: { bandId: number; level: number }[]; claimEveryMinutes: number; minutesPerDay: number };
  dailyClaims: number;
  events: { eventId: string; claimDate: string; points: number | null; fullCollection: boolean; buyLimited: boolean }[];
  purchases: { offerId: string; quantity: number; alreadyPurchased: number }[];
  pass: { passId: string; startsOn: string; claimDates: string[] } | null;
  fixedSources: { sourceId: string; claims: number }[];
  externalIncome: { id: string; name: string; date: string; amounts: MaterialAmount[] }[];
  allocations: { id: string; name: string; date: string; purpose: 'gacha' | 'lb' | 'reserve' | 'other'; costs: MaterialAmount[] }[];
}
export type Certainty = 'confirmed' | 'conditional' | 'expected';
export interface LedgerEntry {
  at: string; sourceId: string; sourceName: string; basis: string; resourceId: string;
  destination: Destination | 'reservation'; certainty: Certainty; quantity: number;
  conditional: boolean;
}
export interface EconomyIssue { sourceId: string; reason: string; resourceIds: string[]; blocksProjection: boolean }
