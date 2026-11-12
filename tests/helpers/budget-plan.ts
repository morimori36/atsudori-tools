import {collectionSealFixture} from './seal-budget';
import {currencyBudget} from './currency-budget';
import type {PassPlan} from '../../src/domain/star-budget/model';

/** Invented entitlements, deliberately unrelated to actual plan counts and periods. */
export function budgetPlanFixture(cost = 60) {
  const {master, collection, definition} = collectionSealFixture();
  const input = currencyBudget(cost);
  master.starBudgetDefinition = {...input.definition, revision: master.revision};
  const {rank, ...scenario} = input.scenario;
  collection.tgwRank = rank!;
  collection.starBudgetScenario = {...scenario, passPlan: 'none'};
  collection.sealBudgetScenario = {cm: false, pass: false, paid: 0, event: 0, selectedProducts: []};
  definition.gachas.find(g => g.id === 'pass')!.pointsPerDraw = 2;
  for (const [index, plan] of (['none', 'lite', 'standard', 'premium'] as const).entries()) {
    definition.planBenefits![plan] = {
      passGachas: index ? [{gachaId: 'pass', draws: index + 1, periodDays: 9, poolId: 'ordinary'},
        ...(plan === 'premium' ? [{gachaId: 'event' as const, draws: 1, periodDays: 4, poolId: 'ordinary'}] : [])] : [],
      paidDailyLimit: plan === 'none' ? 1 : 2,
      eventDailyLimit: plan === 'none' || plan === 'lite' ? 1 : 2,
      basis: '独立した紙細工の利用条件。ゲームの特典ではない',
    };
  }
  return {master, collection, definition};
}

export function selectPlan(fixture: ReturnType<typeof budgetPlanFixture>, plan: PassPlan) {
  fixture.collection.starBudgetScenario!.passPlan = plan;
  return fixture;
}
