import { CP_UNIT, UNITS_PER_CHALLENGE } from './model';
import type { Candidate, ChallengeRank, EventPlannerInput, NormalRank } from './model';
import { hundredths, validateEventInput } from './validate';

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
function safe(value: bigint): number {
  if (value < 0n || value > MAX_SAFE) throw new Error('計算結果が安全な整数の範囲を超えています。入力を小さくしてください');
  return Number(value);
}
export function normalYield(input: EventPlannerInput, candidate: Candidate<NormalRank>): { pt: number; cp: number } {
  const base = input.bases.normal[candidate.rank];
  return {
    pt: safe(BigInt(base.pt) * BigInt(input.normalMultiplier) * (10000n + hundredths(candidate.bonus)) / 10000n),
    cp: safe(BigInt(base.cp) * BigInt(input.normalMultiplier)),
  };
}
export function challengeYield(input: EventPlannerInput, candidate: Candidate<ChallengeRank>): { pt: number; maxPt: number } {
  const pt = BigInt(input.bases.challenge[candidate.rank].pt) * (10000n + hundredths(candidate.bonus)) / 10000n;
  return { pt: safe(pt), maxPt: safe(pt * BigInt(UNITS_PER_CHALLENGE)) };
}
export interface Plan {
  normalIndex: number;
  challengeIndex: number;
  normalRuns: number;
  challengeRuns: number;
  totalRuns: number;
  units: number;
  usedCP: number;
  remainingCP: number;
  reachedPt: number;
  minutes: number;
  cpBreakdown: { cp: number; runs: number }[];
}
export type PairResult = { status: 'planned'; plan: Plan } | { status: 'unreachable'; normalIndex: number; challengeIndex: number; reason: string };
export interface PlannerResult {
  pairs: PairResult[];
  ranked: Plan[];
  best: Plan | undefined;
  searched: { maxUnits: number; pairCount: number; states: number };
}
function requiredRuns(needed: bigint, yieldPerRun: bigint): bigint | undefined {
  if (needed <= 0n) return 0n;
  return yieldPerRun === 0n ? undefined : (needed + yieldPerRun - 1n) / yieldPerRun;
}
export function challengeBreakdown(units: number): Plan['cpBreakdown'] {
  const full = Math.floor(units / UNITS_PER_CHALLENGE), rest = units % UNITS_PER_CHALLENGE;
  return [ ...(full ? [{ cp: CP_UNIT * UNITS_PER_CHALLENGE, runs: full }] : []), ...(rest ? [{ cp: CP_UNIT * rest, runs: 1 }] : []) ];
}
function pairPlan(input: EventPlannerInput, normalIndex: number, challengeIndex: number): PairResult {
  const normal = normalYield(input, input.normal[normalIndex]!);
  const challenge = challengeYield(input, input.challenge[challengeIndex]!);
  const pt = BigInt(normal.pt), cp = BigInt(normal.cp), challengePt = BigInt(challenge.pt);
  const target = BigInt(input.targetPt), current = BigInt(input.currentPt), startingCP = BigInt(input.currentCP);
  let best: { normalRuns: bigint; challengeRuns: bigint; totalRuns: bigint; units: number } | undefined;
  for (let k = 0; k <= input.maxUnits; k++) {
    const usedCP = BigInt(k) * BigInt(CP_UNIT);
    const forCP = requiredRuns(usedCP - startingCP, cp);
    const forPt = requiredRuns(target - current - BigInt(k) * challengePt, pt);
    if (forCP === undefined || forPt === undefined) continue;
    const normalRuns = forCP > forPt ? forCP : forPt;
    const challengeRuns = BigInt(Math.ceil(k / UNITS_PER_CHALLENGE));
    const totalRuns = normalRuns + challengeRuns;
    // Ascending k and a strict comparison keep the first (lowest CP) minimum in this pair.
    if (!best || totalRuns < best.totalRuns) best = { normalRuns, challengeRuns, totalRuns, units: k };
  }
  if (!best) return { status: 'unreachable', normalIndex, challengeIndex, reason: 'この探索範囲ではCPと目標ptを満たせません' };
  const usedCP = BigInt(best.units) * BigInt(CP_UNIT);
  const reachedPt = current + best.normalRuns * pt + BigInt(best.units) * challengePt;
  const remainingCP = startingCP + best.normalRuns * cp - usedCP;
  if (reachedPt < target || remainingCP < 0n) throw new Error('CPまたは到達ptの検証に失敗しました');
  const minuteHundredths = best.totalRuns * hundredths(input.minutesPerRun);
  return { status: 'planned', plan: {
    normalIndex, challengeIndex, normalRuns: safe(best.normalRuns), challengeRuns: safe(best.challengeRuns), totalRuns: safe(best.totalRuns),
    units: best.units, usedCP: safe(usedCP), remainingCP: safe(remainingCP), reachedPt: safe(reachedPt),
    minutes: safe(minuteHundredths) / 100, cpBreakdown: challengeBreakdown(best.units),
  } };
}
export function calculateEventPlans(value: EventPlannerInput): PlannerResult {
  const input = validateEventInput(value);
  const pairs: PairResult[] = [];
  input.normal.forEach((normal, n) => {
    if (!normal.enabled) return;
    input.challenge.forEach((challenge, c) => {
      if (challenge.enabled) pairs.push(pairPlan(input, n, c));
    });
  });
  // Explicit indices make equal-count pairs stable in registration order, regardless of CP use.
  const ranked = pairs.flatMap(pair => pair.status === 'planned' ? [pair.plan] : []).sort((a, b) =>
    a.totalRuns - b.totalRuns || a.normalIndex - b.normalIndex || a.challengeIndex - b.challengeIndex);
  return { pairs, ranked, best: ranked[0], searched: { maxUnits: input.maxUnits, pairCount: pairs.length, states: pairs.length * (input.maxUnits + 1) } };
}
