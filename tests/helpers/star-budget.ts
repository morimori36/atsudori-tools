import { emptyStarBudget } from '../../src/domain/star-budget/validate';
import type { BudgetValue } from '../../src/domain/star-budget/model';

export const assumedBudgetValue = (value: number): BudgetValue => ({ value, status: 'assumed', basis: '独立した人工算術ケース。ゲームの値ではない' });
// Issue #52 explicitly specifies these hypothetical arithmetic acceptance totals.
// Purchase/daily splits and price tiers below are invented solely to exercise the contract.
export function starBudgetFixture() {
  const input = emptyStarBudget(), d = input.definition, m = assumedBudgetValue;
  d.revision = 'fictional-arithmetic-1';
  d.loginDaily = m(20); d.missionDaily = m(15); d.liveStampWeekly = m(160);
  d.liveStampSelection = '人工ケースで選択した週報酬。通常ログインには含めない';
  d.event = { intervalDays: m(10), points: m(360), missionFree: m(50), missionPremium: m(0), storyPerEpisode: m(25), storyEpisodes: m(9) };
  d.season = { intervalDays: m(30), free: m(200), premium: m(1800) };
  d.arena = { intervalDays: m(17), recurringStars: m(0) };
  d.passes = {
    lite: { periodDays: m(30), purchaseStars: m(100), dailyStars: m(20), priceYen: m(123) },
    standard: { periodDays: m(30), purchaseStars: m(300), dailyStars: m(60), priceYen: m(456) },
    premium: { periodDays: m(30), purchaseStars: m(600), dailyStars: m(120), priceYen: m(789) },
  };
  const prices = [12, 24, 20, 20, 24, 48];
  for (const [i, p] of d.products.entries()) {
    p.unlockRank = m(p.id === 'skill-sp' ? 13 : 1);
    p.tiers = p.id.startsWith('sr-') ? [{ starCost: m(4), weeklyLimit: m(20) }, { starCost: m(7), weeklyLimit: m(30) }]
      : [{ starCost: m(prices[i]!), weeklyLimit: m(5) }];
  }
  d.starCompatibility = 'assumed-usable'; d.starCompatibilityBasis = '人工ケースでは全スターを支払に利用できると仮定';
  input.scenario = { rank: 13, storyEventPercent: 100, eventPremium: false, seasonPremium: true, includeArena: true, selectedProducts: d.products.map(p => p.id) };
  return input;
}
