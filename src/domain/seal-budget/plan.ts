import {calculateSealBudget} from './calculate';
import {validateSealBudgetDefinition, validateSealBudgetScenario} from './validate';
import type {SealBudgetDefinition, SealBudgetScenario} from './model';
import type {PassPlan} from '../star-budget/model';
import type {Collection} from '../../storage/collection';

/** Resolve once: both currencies use these same actual draw counts. Never mutate saved choices. */
export function calculatePlannedSeals(
  definition: SealBudgetDefinition, scenario: SealBudgetScenario, plan: PassPlan,
  collection: Pick<Collection, 'members' | 'snaps'> | null,
) {
  const d = validateSealBudgetDefinition(definition), s = validateSealBudgetScenario(scenario, d);
  const benefits = d.planBenefits?.[plan];
  const notes = new Set<string>();
  let unavailable = false;
  const count = (kind: 'paid' | 'event'): 0 | 1 | 2 => {
    const requested = s[kind] ?? 0;
    if (!requested) return 0;
    const limit = benefits?.[kind === 'paid' ? 'paidDailyLimit' : 'eventDailyLimit'];
    if (limit === null || limit === undefined) {
      notes.add(`${kind === 'paid' ? 'アワーノーツ' : 'イベント'}有償ガチャの利用上限は未確認のため除外`);
      return 0;
    }
    if (requested > limit) {
      unavailable = true;
      notes.add(`${kind === 'paid' ? 'アワーノーツ' : 'イベント'}有償ガチャは選択パスの上限を超える分を除外`);
    }
    return Math.min(requested, limit) as 0 | 1 | 2;
  };
  const effective = {...s, pass: false, paid: count('paid'), event: count('event')};
  const result = calculateSealBudget(d, effective, collection);
  const paidDraws = result.income.map(g => {
    const source = d.gachas.find(row => row.id === g.id)!;
    return {...g, quantity: source.draws * Number(effective[g.id] ?? 0), periodDays: source.periodDays};
  });
  if (s.pass && plan !== 'none') {
    if (!benefits || benefits.passGachas === null) notes.add('パス付属ガチャの回数・条件は未確認のため除外');
    else for (const benefit of benefits.passGachas) {
      if (benefit.draws === null || benefit.periodDays === null) {
        notes.add('パス付属ガチャの回数・条件は未確認のため除外');
        continue;
      }
      const copy = structuredClone(d);
      const gacha = copy.gachas.find(g => g.id === benefit.gachaId)!;
      gacha.draws = benefit.draws;
      gacha.periodDays = benefit.periodDays;
      if ('poolId' in gacha && benefit.poolId !== undefined) gacha.poolId = benefit.poolId;
      const bonus = calculateSealBudget(copy, {cm: false, pass: false, paid: 0, event: 0,
        selectedProducts: [], [benefit.gachaId]: benefit.gachaId === 'pass' ? true : 1}, collection);
      for (const row of bonus.income) {
        const target = result.income.find(g => g.id === row.id)!;
        for (const key of ['draws', 'member', 'snap', 'points', 'total'] as const) target[key] += row[key];
      }
      result.totalIncome += bonus.totalIncome;
      result.notes.push(...bonus.notes);
    }
  }
  result.balance = result.totalIncome - result.totalExpense;
  if ([result.totalIncome, result.balance, ...result.income.flatMap(g => [g.draws, g.total])]
    .some(n => !Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER)) throw new Error('ガチャ計画の計算範囲を超えています');
  result.notes = [...new Set([...result.notes, ...notes])];
  return {seals: result, paidDraws, unavailable, planNotes: [...notes]};
}
