export const NORMAL_RANKS = ['S', 'A', 'B', 'C'] as const;
export const CHALLENGE_RANKS = ['SS', 'S', 'A', 'B'] as const;
export type NormalRank = typeof NORMAL_RANKS[number];
export type ChallengeRank = typeof CHALLENGE_RANKS[number];
export const CP_UNIT = 200;
export const MAX_CP_PER_CHALLENGE = 1600;
export const UNITS_PER_CHALLENGE = MAX_CP_PER_CHALLENGE / CP_UNIT;
export const MAX_CANDIDATES = 5;
export const MAX_SEARCH_UNITS = 10000;
export const EVENT_FORMAT = 'atsudori-tools/event-planner';
export interface Candidate<R extends string> { name: string; enabled: boolean; rank: R; bonus: number }
export interface RankBases {
  normal: Record<NormalRank, { pt: number; cp: number }>;
  challenge: Record<ChallengeRank, { pt: number }>;
}
export interface EventPlannerInput {
  format: typeof EVENT_FORMAT;
  schemaVersion: 1;
  targetPt: number;
  currentPt: number;
  currentCP: number;
  normalMultiplier: number;
  minutesPerRun: number;
  maxUnits: number;
  normal: Candidate<NormalRank>[];
  challenge: Candidate<ChallengeRank>[];
  bases: RankBases;
}
export function defaultRankBases(): RankBases {
  return {
    normal: { S: { pt: 75, cp: 8 }, A: { pt: 50, cp: 6 }, B: { pt: 35, cp: 5 }, C: { pt: 25, cp: 4 } },
    challenge: { SS: { pt: 5500 }, S: { pt: 4500 }, A: { pt: 3500 }, B: { pt: 2750 } },
  };
}
export function defaultEventInput(): EventPlannerInput {
  return {
    format: EVENT_FORMAT, schemaVersion: 1,
    targetPt: 525000, currentPt: 0, currentCP: 400, normalMultiplier: 15, minutesPerRun: 2, maxUnits: 200,
    normal: [{ name: '', enabled: true, rank: 'S', bonus: 0 }],
    challenge: [{ name: '', enabled: true, rank: 'SS', bonus: 0 }],
    bases: defaultRankBases(),
  };
}
export function candidateName(candidate: Candidate<string>, kind: 'normal' | 'challenge', index: number): string {
  return candidate.name.trim() || `${kind === 'normal' ? '通常' : 'チャレンジ'}候補${index + 1}`;
}
