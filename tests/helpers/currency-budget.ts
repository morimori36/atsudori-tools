import { CURRENCY_SOURCES } from '../../src/domain/star-budget/model';
import { emptyStarBudget } from '../../src/domain/star-budget/validate';
import type { BudgetValue, CurrencyBreakdown } from '../../src/domain/star-budget/model';
export const measure = (value: number): BudgetValue => ({value, status:'assumed', basis:'独立した架空の通貨計算例'});
export function currencyBudget(cost = 60) {
  const input = emptyStarBudget(), d = input.definition, m = measure;
  for (const key of CURRENCY_SOURCES) {
    const parts = key.split('.'), last = parts.pop()!;
    const row = parts.reduce<unknown>((r,k) => (r as Record<string,unknown>)[k], d) as Record<string,unknown>;
    row[last] = m(0);
  }
  d.liveStampWeekly=m(90); d.liveStampSelection='架空の週報酬選択';
  d.event.intervalDays=m(7); d.event.storyEpisodes=m(2);
  d.season.intervalDays=m(7); d.season.free=m(40);
  d.starCompatibility='confirmed-usable'; d.starCompatibilityBasis='架空ケースの利用条件';
  for (const [i,p] of d.products.entries()) {p.name='架空商品'+i;p.unlockRank=m(1);p.tiers=[{starCost:m(cost),weeklyLimit:m(1)}];}
  for (const [i,p] of Object.values(d.passes).entries()) {p.periodDays=m(7);p.priceYen=m(31+i);p.purchaseStars=m(13*(i+1));p.dailyStars=m(i+1);}
  const sources = Object.fromEntries(CURRENCY_SOURCES.map(key => {
    const total = key.split('.').reduce<unknown>((r,k) => (r as Record<string,unknown>)[k],d) as BudgetValue;
    return [key,{free:m(key==='liveStampWeekly'?90:key.endsWith('dailyStars')?total.value!:0),paid:m(key==='season.free'?40:key.endsWith('purchaseStars')?total.value!:0)}];
  })) as CurrencyBreakdown['sources'];
  d.currencyBreakdown={version:1,paymentPriority:'free-first',basis:'架空ケースでは無償優先',sources};
  input.scenario={rank:1,storyEventPercent:100,eventPremium:false,seasonPremium:false,selectedProducts:['crystal-luck']};
  return input;
}
