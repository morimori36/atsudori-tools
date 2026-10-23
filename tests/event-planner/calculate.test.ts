import { describe, expect, it } from 'vitest';
import { calculateEventPlans, challengeBreakdown, challengeYield, normalYield } from '../../src/domain/event-planner/calculate';
import { defaultEventInput } from '../../src/domain/event-planner/model';
import { exampleEventInput } from '../helpers/event-input';

it('matches the specified acceptance case without changing the formulas', () => {
  const input = exampleEventInput(), result = calculateEventPlans(input);
  expect(result.best).toEqual({ normalIndex: 0, challengeIndex: 1, totalRuns: 87, normalRuns: 80, challengeRuns: 7, units: 50,
    usedCP: 10000, reachedPt: 531300, remainingCP: 0, minutes: 174, cpBreakdown: [{ cp: 1600, runs: 6 }, { cp: 400, runs: 1 }] });
  expect(result.ranked.map(plan => plan.totalRuns)).toEqual([87, 91, 106, 112]);
  expect(result.searched).toEqual({ maxUnits: 200, pairCount: 4, states: 804 });
  expect(normalYield(input, input.normal[0]!)).toEqual({ pt: 1260, cp: 120 });
  expect(challengeYield(input, input.challenge[1]!)).toEqual({ pt: 8610, maxPt: 68880 });
  expect(input).toEqual(exampleEventInput());
});

it('floors challenge unit points before multiplying and handles decimal floor boundaries exactly', () => {
  const input = defaultEventInput();
  input.challenge[0]!.rank = 'B'; input.challenge[0]!.bonus = 0.01;
  // 2750 * 1.0001 = 2750.275 -> 2750; eight units = 22000, not floor(22002.2).
  expect(challengeYield(input, input.challenge[0]!)).toEqual({ pt: 2750, maxPt: 22000 });
  input.normalMultiplier = 1; input.bases.normal.S.pt = 100; input.normal[0]!.bonus = 0.29;
  expect(normalYield(input, input.normal[0]!).pt).toBe(100);
  input.bases.normal.S.pt = 10000;
  expect(normalYield(input, input.normal[0]!).pt).toBe(10029);
});

it('funds CP without going negative and represents a legal sequence of challenges', () => {
  const input = exampleEventInput(); input.currentCP = 0;
  const result = calculateEventPlans(input);
  for (const plan of result.ranked) {
    const gain = normalYield(input, input.normal[plan.normalIndex]!);
    let cp = input.currentCP + gain.cp * plan.normalRuns;
    for (const part of plan.cpBreakdown) {
      expect(part.cp % 200).toBe(0); expect(part.cp).toBeGreaterThanOrEqual(200); expect(part.cp).toBeLessThanOrEqual(1600);
      for (let i = 0; i < part.runs; i++) { cp -= part.cp; expect(cp).toBeGreaterThanOrEqual(0); }
    }
    expect(cp).toBe(plan.remainingCP); expect(plan.reachedPt).toBeGreaterThanOrEqual(input.targetPt);
    expect(plan.cpBreakdown.reduce((sum, part) => sum + part.runs, 0)).toBe(plan.challengeRuns);
  }
});

it('includes k=0, including when it wins with an enabled challenge candidate', () => {
  const input = defaultEventInput(); input.targetPt = 1; input.currentCP = 0;
  expect(calculateEventPlans(input).best).toMatchObject({ totalRuns: 1, normalRuns: 1, challengeRuns: 0, units: 0 });
  input.maxUnits = 0; input.targetPt = 2251;
  expect(calculateEventPlans(input).best).toMatchObject({ totalRuns: 3, units: 0, reachedPt: 3375 });
});

it('needs no runs after the target is reached, even when yields are zero', () => {
  const input = defaultEventInput(); input.currentPt = input.targetPt + 7;
  input.bases.normal.S = { pt: 0, cp: 0 }; input.bases.challenge.SS.pt = 0;
  expect(calculateEventPlans(input).best).toMatchObject({ totalRuns: 0, units: 0, reachedPt: 525007, remainingCP: 400, minutes: 0 });
});

it('skips disabled candidates and handles no active pair', () => {
  const input = exampleEventInput(); input.normal[0]!.enabled = false;
  expect(calculateEventPlans(input).best).toMatchObject({ normalIndex: 1, challengeIndex: 1, totalRuns: 106 });
  input.challenge.forEach(candidate => { candidate.enabled = false; });
  expect(calculateEventPlans(input)).toMatchObject({ best: undefined, ranked: [], pairs: [], searched: { pairCount: 0, states: 0 } });
  input.normal = []; expect(calculateEventPlans(input).pairs).toEqual([]);
});

it('keeps the lowest k within a pair and registration order across equal-count pairs', () => {
  const input = defaultEventInput(); input.targetPt = 100; input.currentCP = 1600;
  input.normalMultiplier = 1; input.bases.normal.S = { pt: 1, cp: 1 }; input.bases.challenge.SS.pt = 100;
  expect(calculateEventPlans(input).best).toMatchObject({ units: 1, totalRuns: 1 });
  input.challenge.push({ ...input.challenge[0]!, rank: 'S' }); input.bases.challenge.S.pt = 200;
  input.normal.push({ ...input.normal[0]! });
  expect(calculateEventPlans(input).ranked.map(p => [p.normalIndex, p.challengeIndex])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
  // Earlier pair needs two units, later pair needs only one: pair tie still uses registration order.
  input.targetPt = 200;
  expect(calculateEventPlans(input).best).toMatchObject({ challengeIndex: 0, units: 2, totalRuns: 1 });
});

it('uses editable rank bases, the actual multiplier, and decimal minutes', () => {
  const input = defaultEventInput(); input.maxUnits = 0; input.normalMultiplier = 3; input.targetPt = 100;
  input.bases.normal.S = { pt: 11, cp: 2 }; input.minutesPerRun = 1.25;
  expect(calculateEventPlans(input).best).toMatchObject({ normalRuns: 4, reachedPt: 132, remainingCP: 424, minutes: 5 });
});

it('handles zero CP/points without dividing by zero and reports unreachable pairs', () => {
  const input = defaultEventInput(); input.currentCP = 200; input.targetPt = 5500; input.bases.normal.S = { pt: 0, cp: 0 };
  expect(calculateEventPlans(input).best).toMatchObject({ normalRuns: 0, challengeRuns: 1, units: 1 });
  input.currentCP = 0;
  expect(calculateEventPlans(input).pairs).toEqual([{ status: 'unreachable', normalIndex: 0, challengeIndex: 0, reason: expect.any(String) }]);
});

it('states and honors the search limit rather than claiming an unbounded optimum', () => {
  const input = exampleEventInput(); input.maxUnits = 1;
  expect(calculateEventPlans(input).best!.units).toBeLessThanOrEqual(1);
  expect(calculateEventPlans(input).best!.totalRuns).toBeGreaterThan(87);
  expect(calculateEventPlans(input).searched).toEqual({ maxUnits: 1, pairCount: 4, states: 8 });
});

it('rejects overflow rather than returning imprecise results', () => {
  const input = defaultEventInput(); input.normalMultiplier = Number.MAX_SAFE_INTEGER;
  expect(() => calculateEventPlans(input)).toThrow('安全な整数');
});

it('splits CP into full challenges and at most one remainder', () => {
  expect(challengeBreakdown(0)).toEqual([]);
  expect(challengeBreakdown(8)).toEqual([{ cp: 1600, runs: 1 }]);
  expect(challengeBreakdown(17)).toEqual([{ cp: 1600, runs: 2 }, { cp: 200, runs: 1 }]);
});

describe('independent enumeration of small fictional plans', () => {
  for (const target of [0, 1, 5, 19, 37]) for (const currentCP of [0, 199, 200, 400]) {
    it(`matches all feasible run counts for target=${target}, CP=${currentCP}`, () => {
      const input = defaultEventInput(); input.targetPt = target; input.currentCP = currentCP; input.normalMultiplier = 1; input.maxUnits = 10;
      input.bases.normal.S = { pt: 3, cp: 100 }; input.bases.challenge.SS.pt = 7;
      // Enumerate both live counts, independently of the requiredRuns formula.
      const feasible: { normalRuns: number; units: number; totalRuns: number }[] = [];
      for (let n = 0; n <= 40; n++) for (let k = 0; k <= 10; k++) {
        if (currentCP + n * 100 >= k * 200 && n * 3 + k * 7 >= target)
          feasible.push({ normalRuns: n, units: k, totalRuns: n + Math.ceil(k / 8) });
      }
      feasible.sort((a, b) => a.totalRuns - b.totalRuns || a.units - b.units);
      expect(calculateEventPlans(input).best).toMatchObject(feasible[0]!);
    });
  }
});
