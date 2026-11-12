export const GACHA_KINDS = ['cm', 'pass', 'paid'] as const;
export type GachaKind = typeof GACHA_KINDS[number];
/** null is unknown; zero is confirmed absence. Probabilities use basis points. */
export interface SealGacha {
  id: GachaKind; name: string; draws: number; periodDays: number;
  memberProbabilityBp: number | null; snapProbabilityBp: number | null; otherProbabilityBp: number | null;
  memberSeals: number | null; snapSeals: number | null;
  pointsPerDraw: number | null; sealsPerPoint: number | null; paidStarsPerDraw: number | null;
}
export interface SealProduct { id: string; name: string; tiers: { sealCost: number | null; monthlyLimit: number | null }[] }
export interface SealBudgetDefinition { version: 1; revision: string; gachas: SealGacha[]; products: SealProduct[] }
export interface SealBudgetScenario { cm: boolean; pass: boolean; paid: 0 | 1 | 2; selectedProducts: string[] }
export const defaultSealBudgetScenario = (): SealBudgetScenario => ({ cm: false, pass: false, paid: 0, selectedProducts: [] });
