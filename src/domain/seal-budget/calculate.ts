import {validateSealBudgetDefinition, validateSealBudgetScenario} from './validate';
import type {DuplicateReward, SealBudgetDefinition, SealBudgetScenario, SealCardRule} from './model';
import type {Collection} from '../../storage/collection';

/** The caller supplies validated, actual ownership. Missing snapshot is unknown, not empty. */
export function calculateSealBudget(
  definition: SealBudgetDefinition,
  scenario: SealBudgetScenario,
  collection?: Pick<Collection, 'members' | 'snaps'> | null,
) {
  const d = validateSealBudgetDefinition(definition), s = validateSealBudgetScenario(scenario, d);
  const notes = new Set<string>();
  const checked = (n: number): number => {
    if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER) throw new Error('シール予算: 計算範囲を超えています');
    return n;
  };
  const unknown = (label: string) => { notes.add(label + 'は未確認のため除外'); };
  const multiply = (a: number | null, b: number | null, label: string): number => {
    if (a === 0 || b === 0) return 0;
    if (a === null || b === null) { unknown(label); return 0; }
    return checked(a * b);
  };
  const members = new Map(collection?.members.map(c => [c.cardId, c.awakeningStage]));
  const snaps = new Map(collection?.snaps.map(c => [c.supportCardId, c.rank]));
  const seals = (reward: DuplicateReward | null): number | null =>
    reward === null ? null : reward.kind === 'seals' ? reward.amount : 0;
  const cardSeals = (rule: SealCardRule): number | null => {
    // Only duplicates of cards already complete at the start contribute.
    const after = seals(rule.afterCompletion);
    if (!collection) return after === 0 ? 0 : null;
    const stage = (rule.kind === 'member' ? members : snaps).get(rule.cardId);
    // In a valid collection, absent cards are explicitly unowned. The first copy is retained.
    if (stage === undefined) return 0;
    if (!Number.isSafeInteger(stage) || stage < 1) throw new Error('シール予算: 所持の育成段階が不正です');
    if (rule.completedAt === null) return after === 0 ? 0 : null;
    return stage >= rule.completedAt ? after : 0;
  };
  const rules = new Map(d.version === 3 ? d.cards.map(c => [`${c.kind}:${c.cardId}`, c]) : []);
  const pools = new Map(d.version === 3 ? d.pools.map(p => [p.id, p]) : []);
  const income = d.gachas.map(g => {
    const enabled = s[g.id];
    const draws = enabled ? checked(g.draws / g.periodDays * 30 * (g.id === 'paid' ? s.paid : g.id === 'event' ? (s.event ?? 0) : 1)) : 0;
    let member = 0, snap = 0;
    if (draws && 'poolId' in g) {
      const pool = pools.get(g.poolId)!;
      for (const card of pool.cards) {
        if (card.probability === 0) continue;
        const rule = rules.get(`${card.kind}:${card.cardId}`)!;
        const reward = cardSeals(rule);
        const label = g.name + (card.probability === null ? 'の提供割合'
          : !collection ? 'の所持状態' : rule.completedAt === null ? 'の完凸条件' : 'のシール報酬');
        const value = multiply(card.probability, reward, label) / pool.probabilityScale;
        if (card.kind === 'member') member = checked(member + value);
        else snap = checked(snap + value);
      }
      if (pool.otherProbability === null) unknown(g.name + 'の提供割合');
      member = checked(member * draws);
      snap = checked(snap * draws);
    } else if (draws && 'memberProbabilityBp' in g) {
      member = checked(multiply(g.memberProbabilityBp, g.memberSeals, g.name + 'のRメンバー') / 10000 * draws);
      snap = checked(multiply(g.snapProbabilityBp, g.snapSeals, g.name + 'のRスナップ') / 10000 * draws);
    }
    const points = draws && g.id !== 'paid' ? checked(multiply(g.pointsPerDraw, g.sealsPerPoint, g.name + 'のPt交換') * draws) : 0;
    return {id: g.id, name: g.name, draws, member, snap, points, total: checked(member + snap + points)};
  });
  const expenses = d.products.map(p => ({id: p.id, name: p.name, selected: s.selectedProducts.includes(p.id),
    total: s.selectedProducts.includes(p.id) ? p.tiers.reduce((sum, t) => checked(sum + multiply(t.sealCost, t.monthlyLimit, p.name + 'の価格・月上限')), 0) : 0}));
  const totalIncome = income.reduce((sum, r) => checked(sum + r.total), 0);
  const totalExpense = expenses.reduce((sum, r) => checked(sum + r.total), 0);
  return {income, expenses, totalIncome, totalExpense, balance: totalIncome - totalExpense, notes: [...notes], mode: d.version === 2 ? 'fixed' as const : 'collection' as const};
}
