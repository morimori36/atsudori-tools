export const PASS_GRADES = ['lite', 'standard', 'premium'] as const;
export type PassGrade = typeof PASS_GRADES[number];
export type PassPlan = 'none' | PassGrade;
export const PRODUCT_NAMES = {
  'crystal-luck': '幸運のクリスタル',
  'crystal-miracle': '奇跡のクリスタル',
  'skill-live': 'ライブスキル強化チケット',
  'skill-gekisou': '撃奏スキル強化チケット',
  'skill-basic': '通常スキル強化チケット',
  'skill-sp': 'SPスキル強化チケット',
  'sr-1': 'SRピース（バンド1）',
  'sr-2': 'SRピース（バンド2）',
  'sr-3': 'SRピース（バンド3）',
  'sr-4': 'SRピース（バンド4）',
  'sr-5': 'SRピース（バンド5）',
} as const;
export type ProductId = keyof typeof PRODUCT_NAMES;
export const PRODUCT_IDS = Object.keys(PRODUCT_NAMES) as ProductId[];
export type EvidenceStatus = 'unconfirmed' | 'assumed' | 'confirmed';
export interface BudgetValue {
  value: number | null;
  status: EvidenceStatus;
  basis: string;
}
export interface BudgetProduct {
  id: ProductId;
  name: string;
  unlockRank: BudgetValue;
  // All tiers are fully exchanged. Limits count exchanges, including a pack as one exchange.
  tiers: { starCost: BudgetValue; weeklyLimit: BudgetValue }[];
}
export const CURRENCY_SOURCES = [
  'loginDaily', 'missionDaily', 'liveStampWeekly', 'event.points', 'event.missionFree',
  'event.missionPremium', 'event.storyPerEpisode', 'season.free', 'season.premium',
  ...PASS_GRADES.flatMap(grade =>
    [`passes.${grade}.purchaseStars`, `passes.${grade}.dailyStars`] as const),
] as const;
export type CurrencySource = typeof CURRENCY_SOURCES[number];
export interface CurrencyBreakdown {
  version: 1;
  paymentPriority: 'free-first';
  basis: string;
  sources: Record<CurrencySource, { free: BudgetValue; paid: BudgetValue }>;
}
export interface StarBudgetDefinition {
  currencyBreakdown?: CurrencyBreakdown;
  revision: string;
  loginDaily: BudgetValue;
  missionDaily: BudgetValue;
  liveStampWeekly: BudgetValue;
  liveStampSelection: string;
  event: {
    intervalDays: BudgetValue;
    points: BudgetValue;
    missionFree: BudgetValue;
    missionPremium: BudgetValue;
    storyPerEpisode: BudgetValue;
    storyEpisodes: BudgetValue;
  };
  season: { intervalDays: BudgetValue; free: BudgetValue; premium: BudgetValue };
  passes: Record<PassGrade, {
    periodDays: BudgetValue;
    purchaseStars: BudgetValue;
    dailyStars: BudgetValue;
    priceYen: BudgetValue;
  }>;
  starCompatibility: 'unconfirmed' | 'assumed-usable' | 'confirmed-usable' | 'restricted';
  starCompatibilityBasis: string;
  products: BudgetProduct[];
}
export interface StarBudgetInput {
  definition: StarBudgetDefinition;
  scenario: StarBudgetScenario & { rank: number | null };
}
export interface StarBudgetScenario {
  passPlan?: PassPlan;
  storyEventPercent: number | null;
  eventPremium: boolean;
  seasonPremium: boolean;
  selectedProducts: ProductId[];
}

/** Read defaults without materializing omitted collection fields. */
export function defaultStarBudgetScenario(): StarBudgetScenario {
  return { storyEventPercent: null, eventPremium: false, seasonPremium: false, selectedProducts: [...PRODUCT_IDS] };
}
