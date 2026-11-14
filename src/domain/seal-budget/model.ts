import type {PassPlan} from '../star-budget/model';
export const GACHA_KINDS = ['cm', 'pass', 'paid', 'event'] as const;
export type GachaKind = typeof GACHA_KINDS[number];
interface GachaBase {
  id: GachaKind; name: string; draws: number; periodDays: number;
  pointsPerDraw: number | null; sealsPerPoint: number | null; paidStarsPerDraw: number | null;
}
export type SealCardKind = 'member' | 'snap';
export interface SealCardRef { kind: SealCardKind; cardId: number }
/** Pieces are not automatically exchanged for seals. null means unconfirmed. */
export type DuplicateReward = { kind: 'pieces' | 'none' } | { kind: 'seals'; amount: number | null };
export interface SealCardRule extends SealCardRef {
  /** Confirmed threshold in awakeningStage (member) or rank (snap), NOT trainingStage/Lv. */
  completedAt: number | null;
  /** Reward for a duplicate already complete at calculation start. */
  duplicateReward: DuplicateReward | null;
}
export interface SealPool {
  id: string;
  /** Integer probability units, so per-card rates need not be rounded to basis points. */
  probabilityScale: number;
  cards: (SealCardRef & { probability: number | null })[];
  /** Confirmed non-card outcomes only. Missing card rates must remain null. */
  otherProbability: number | null;
}
export interface SealGacha extends GachaBase { poolId: string }
export interface SealProduct { id: string; name: string; tiers: { sealCost: number | null; monthlyLimit: number | null }[] }
export interface PassGachaBenefit {
  gachaId: 'pass' | 'paid' | 'event'; draws: number | null; periodDays: number | null;
  /** Optional distribution for this free entitlement. */
  poolId?: string;
}
export interface PlanBenefits {
  passGachas: PassGachaBenefit[] | null;
  paidDailyLimit: 0 | 1 | 2 | null;
  eventDailyLimit: 0 | 1 | 2 | null;
  basis: string;
}
interface DefinitionBase {
  revision: string; products: SealProduct[];
  planBenefits?: Record<PassPlan, PlanBenefits>;
}
export interface SealBudgetDefinition extends DefinitionBase {
  version: 3; gachas: SealGacha[]; pools: SealPool[]; cards: SealCardRule[];
}
export interface SealBudgetScenario { cm: boolean; pass: boolean; eventFree?: boolean; paid: 0 | 1 | 2; event?: 0 | 1 | 2; selectedProducts: string[] }
export const defaultSealBudgetScenario = (): SealBudgetScenario => ({ cm: false, pass: false, eventFree: false, paid: 0, event: 0, selectedProducts: [] });
