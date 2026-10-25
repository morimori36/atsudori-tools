/** Units and rounding are documented in docs/calculation.md, separately from total power. */
export interface Stats {
  readonly performance: number;
  readonly technic: number;
  readonly visual: number;
}

export interface RatingInput {
  readonly memberDisplayedStats: Stats;
  /** Formula A, distinct from member training/level. */
  readonly awakeLevel: number;
  readonly liveSkillLevel: number;
  readonly gekisouSkillLevel: number;
  readonly characterRank: number;
  /** Flat points per parameter from the total character rank; required, never inferred here. */
  readonly totalRankBonus: number;
  /** Formula U; no Snap is represented by U=0 and all percentages=0. */
  readonly snapLimitBreak: number;
  /** 31.00% => 3100; fraction denominator 10000. */
  readonly snapPercentBp: Stats;
  /** 2.1% => 21; fraction denominator 1000. */
  readonly bandItemTenthPercent: number;
}

export interface RatingBreakdown {
  readonly postMemberStats: Stats;
  readonly memberBase: number;
  readonly snapMultiplierBp: number;
  readonly bandRating: number;
}

export function requireInteger(value: number, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be a safe integer >= ${minimum}`);
  }
}

function toSafeNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds safe integer range`);
  }
  return Number(value);
}

/** Pure integer evaluation. Floors only each X_i and the final B*K. */
export function calculateRating(input: RatingInput): RatingBreakdown {
  for (const [key, value] of Object.entries(input.memberDisplayedStats)) {
    requireInteger(value, `memberDisplayedStats.${key}`);
  }
  for (const [key, value] of Object.entries(input.snapPercentBp)) {
    requireInteger(value, `snapPercentBp.${key}`);
  }
  requireInteger(input.awakeLevel, 'awakeLevel', 1);
  requireInteger(input.liveSkillLevel, 'liveSkillLevel', 1);
  requireInteger(input.gekisouSkillLevel, 'gekisouSkillLevel', 1);
  requireInteger(input.characterRank, 'characterRank', 1);
  requireInteger(input.totalRankBonus, 'totalRankBonus');
  requireInteger(input.snapLimitBreak, 'snapLimitBreak');
  requireInteger(input.bandItemTenthPercent, 'bandItemTenthPercent');

  const h100 = 100n + 2n * BigInt(input.awakeLevel)
    + BigInt(input.liveSkillLevel) + BigInt(input.gekisouSkillLevel);
  const c = 5n * (BigInt(input.characterRank) - 1n) + BigInt(input.totalRankBonus);
  const item1000 = 1000n + BigInt(input.bandItemTenthPercent);
  const component = (stat: number): bigint =>
    ((BigInt(stat) * h100 + 100n * c) * item1000) / 100000n;
  const p = component(input.memberDisplayedStats.performance);
  const t = component(input.memberDisplayedStats.technic);
  const v = component(input.memberDisplayedStats.visual);
  const b = p + t + v;
  const k10000 = 10000n + BigInt(input.snapPercentBp.performance)
    + BigInt(input.snapPercentBp.technic) + BigInt(input.snapPercentBp.visual)
    + 200n * BigInt(input.snapLimitBreak);
  return {
    postMemberStats: {
      performance: toSafeNumber(p, 'performance'),
      technic: toSafeNumber(t, 'technic'),
      visual: toSafeNumber(v, 'visual'),
    },
    memberBase: toSafeNumber(b, 'memberBase'),
    snapMultiplierBp: toSafeNumber(k10000, 'snapMultiplierBp'),
    bandRating: toSafeNumber((b * k10000) / 10000n, 'bandRating'),
  };
}
