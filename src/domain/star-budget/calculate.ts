import { PASS_GRADES } from './model';
import type { BudgetValue, PassGrade, ProductId, StarBudgetInput } from './model';
import { validateStarBudget } from './validate';

export interface BudgetAmount { value: number | null; knownSubtotal: number; reasons: string[] }
export interface BudgetSupplyRow extends BudgetAmount { id: string; name: string; evidence: string[] }
export interface BudgetProductRow extends BudgetAmount { id: ProductId; name: string; selected: boolean; availability: 'off' | 'locked' | 'unlocked' | 'unknown'; evidence: string[] }
export interface BudgetComparison {
  grade: 'none' | PassGrade;
  commonSupply: BudgetAmount;
  passSupply: BudgetAmount;
  totalSupply: BudgetAmount;
  weeklyCost: BudgetAmount;
  balance: BudgetAmount;
  status: 'unknown' | 'shortfall' | 'surplus' | 'balanced';
  yenPer30Days: BudgetAmount;
  evidence: string[];
}
interface Fraction { n: bigint; d: bigint }
interface Amount { value: Fraction | null; subtotal: Fraction; reasons: string[] }
const zero: Fraction = { n: 0n, d: 1n };
function fraction(n: bigint, d = 1n): Fraction {
  let a = n < 0n ? -n : n, b = d;
  while (b) [a, b] = [b, a % b];
  return { n: n / a, d: d / a };
}
const add = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const multiply = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.n, a.d * b.d);
function numeric(f: Fraction): number {
  if ((f.n < 0n ? -f.n : f.n) > BigInt(Number.MAX_SAFE_INTEGER) * f.d) throw new Error('スター予算の計算結果が安全な数値範囲を超えます');
  return Number(f.n) / Number(f.d);
}
const known = (value = zero): Amount => ({ value, subtotal: value, reasons: [] });
const unknown = (reason: string): Amount => ({ value: null, subtotal: zero, reasons: [reason] });
function sum(values: Amount[]): Amount {
  return { value: values.every(v => v.value !== null) ? values.reduce((a, v) => add(a, v.value!), zero) : null,
    subtotal: values.reduce((a, v) => add(a, v.subtotal), zero), reasons: [...new Set(values.flatMap(v => v.reasons))] };
}
const publicAmount = (a: Amount): BudgetAmount => ({ value: a.value === null ? null : numeric(a.value), knownSubtotal: numeric(a.subtotal), reasons: a.reasons });
const integer = (n: number): Fraction => fraction(BigInt(n));
function dayFraction(days: number): Fraction {
  const [whole, decimals = ''] = String(days).split('.');
  return fraction(BigInt(whole!) * 100n + BigInt(decimals.padEnd(2, '0')), 100n);
}
function periodic(quantity: BudgetValue, days: BudgetValue | number, label: string, window = 7): Amount {
  if (quantity.value === null) return unknown(label + 'の数量が未確認');
  if (quantity.value === 0) return known();
  const period = typeof days === 'number' ? days : days.value;
  if (period === null) return unknown(label + 'の換算日数が未確認');
  const d = dayFraction(period);
  return known(fraction(BigInt(quantity.value) * BigInt(window) * d.d, d.n));
}
export function budgetEvidence(label: string, metric: BudgetValue): string {
  const status = { unconfirmed: '未確認', assumed: '仮定', confirmed: '確認済み（登録者の申告）' }[metric.status];
  return `${label}: ${metric.value ?? '未登録'} / ${status}${metric.basis ? ' / ' + metric.basis : ''}`;
}
export function calculateStarBudget(input: StarBudgetInput) {
  const { definition: d, scenario: s } = validateStarBudget(input);
  const supply: BudgetSupplyRow[] = [], amounts: Amount[] = [];
  function source(id: string, name: string, amount: Amount, evidence: string[]): void {
    amounts.push(amount); supply.push({ id, name, ...publicAmount(amount), evidence });
  }
  const ev = budgetEvidence;
  source('login', '通常ログインボーナス', periodic(d.loginDaily, 1, '通常ログイン'), [ev('1日分（ライブスタンプを除く）', d.loginDaily)]);
  source('missions', 'デイリーミッション', periodic(d.missionDaily, 1, 'デイリーミッション'), [ev('1日分', d.missionDaily)]);
  const stamp = d.liveStampWeekly.value !== null && d.liveStampWeekly.value > 0 && !d.liveStampSelection.trim()
    ? unknown('ライブスタンプの報酬選択が未確認') : periodic(d.liveStampWeekly, 7, 'ライブスタンプ');
  source('live-stamp', 'ライブスタンプ', stamp, [ev('1週分', d.liveStampWeekly), '報酬選択: ' + (d.liveStampSelection || '未登録')]);
  const eventDays = ev('想定イベント間隔（日）', d.event.intervalDays);
  source('event-points', 'イベント累計pt', periodic(d.event.points, d.event.intervalDays, 'イベント累計pt'), [ev('1イベント分', d.event.points), eventDays]);
  source('event-free', 'イベントミッション無料', periodic(d.event.missionFree, d.event.intervalDays, 'イベントミッション無料'), [ev('1イベント分', d.event.missionFree), eventDays]);
  source('event-premium', 'イベントミッションPremium追加', s.eventPremium ? periodic(d.event.missionPremium, d.event.intervalDays, 'イベントミッションPremium') : known(),
    s.eventPremium ? [ev('無料分を含まない追加スター', d.event.missionPremium), eventDays] : ['Premium購入OFF（追加分を除外）']);
  let story: Amount;
  if (s.storyEventPercent === 0) story = known();
  else if (s.storyEventPercent === null) story = unknown('ストーリー付きイベント割合が未確認');
  else if (d.event.storyEpisodes.value === 0 || d.event.storyPerEpisode.value === 0) story = known();
  else if (d.event.storyEpisodes.value === null) story = unknown('イベントストーリー話数が未確認');
  else {
    story = periodic(d.event.storyPerEpisode, d.event.intervalDays, 'イベントストーリー');
    const scale = fraction(BigInt(d.event.storyEpisodes.value) * BigInt(s.storyEventPercent), 100n);
    story = { ...story, value: story.value === null ? null : multiply(story.value, scale), subtotal: multiply(story.subtotal, scale) };
  }
  source('story', 'イベントストーリー', story, [ev('1話のスター', d.event.storyPerEpisode), ev('全回収話数', d.event.storyEpisodes),
    'ストーリー付き割合: ' + (s.storyEventPercent === null ? '未確認' : s.storyEventPercent + '%'), eventDays]);
  const seasonDays = ev('シーズン換算日数', d.season.intervalDays);
  source('season-free', 'シーズンミッション無料', periodic(d.season.free, d.season.intervalDays, 'シーズンミッション無料'), [ev('1シーズン分', d.season.free), seasonDays]);
  source('season-premium', 'シーズンミッションPremium追加', s.seasonPremium ? periodic(d.season.premium, d.season.intervalDays, 'シーズンミッションPremium') : known(),
    s.seasonPremium ? [ev('無料分を含まない追加スター', d.season.premium), seasonDays] : ['Premium購入OFF（追加分を除外）']);
  const common = sum(amounts);
  const productAmounts: Amount[] = [];
  const products: BudgetProductRow[] = d.products.map(p => {
    const selected = s.selectedProducts.includes(p.id);
    const evidence = [ev('解放T.G.Wランク', p.unlockRank), ...p.tiers.flatMap((t, i) => [ev(`価格段階${i + 1} / 1交換のスター`, t.starCost), ev(`価格段階${i + 1} / 週交換上限`, t.weeklyLimit)])];
    let availability: BudgetProductRow['availability'], cost: Amount;
    if (!selected) { availability = 'off'; cost = known(); }
    else if (p.unlockRank.value === null || s.rank === null) { availability = 'unknown'; cost = unknown(p.name + 'の解放条件またはT.G.Wランクが未確認'); }
    else if (s.rank < p.unlockRank.value) { availability = 'locked'; cost = known(); }
    else {
      availability = 'unlocked';
      cost = sum(p.tiers.map((t, i) => t.weeklyLimit.value === 0 ? known()
        : t.starCost.value === null || t.weeklyLimit.value === null ? unknown(`${p.name}の価格段階${i + 1}の価格・上限が未確認`)
          : known(multiply(integer(t.starCost.value), integer(t.weeklyLimit.value)))));
    }
    productAmounts.push(cost);
    return { id: p.id, name: p.name, selected, availability, ...publicAmount(cost), evidence };
  });
  const cost = sum(productAmounts);
  const compatibility = d.starCompatibility === 'assumed-usable' || d.starCompatibility === 'confirmed-usable';
  const comparisons: BudgetComparison[] = (['none', ...PASS_GRADES] as const).map(grade => {
    const p = grade === 'none' ? null : d.passes[grade];
    const extra = p ? sum([periodic(p.purchaseStars, p.periodDays, grade + '購入時スター'), periodic(p.dailyStars, 1, grade + '毎日スター')]) : known();
    const total = sum([common, extra]);
    const balance = !compatibility ? unknown('カタログ支払時のスター合算可否が未確認、または利用制約があります')
      : total.value === null || cost.value === null ? { value: null, subtotal: zero, reasons: [...new Set([...total.reasons, ...cost.reasons])] }
        : known(add(total.value, fraction(-cost.value.n, cost.value.d)));
    return { grade, commonSupply: publicAmount(common), passSupply: publicAmount(extra), totalSupply: publicAmount(total), weeklyCost: publicAmount(cost), balance: publicAmount(balance),
      status: balance.value === null ? 'unknown' : balance.value.n < 0n ? 'shortfall' : balance.value.n > 0n ? 'surplus' : 'balanced',
      yenPer30Days: publicAmount(p ? periodic(p.priceYen, p.periodDays, grade + '参考料金', 30) : known()),
      evidence: p ? [ev('継続更新日数', p.periodDays), ev('購入時スター', p.purchaseStars), ev('毎日スター', p.dailyStars), ev('1契約の円価格', p.priceYen)] : ['アワーノーツパス未購入'],
    };
  });
  return { supply, products, comparisons, commonSupply: publicAmount(common), weeklyCost: publicAmount(cost),
    assumptions: [
      'アリーナは継続的なスター収入の根拠を確認できないため予算対象外です。旧設定は現在の収支に適用しません。初回到達・シーズン・交換報酬やアリーナピックも週平均スターへ換算しません。',
      '数量÷周期（日）×7で週平均へ換算。日次は×7、週次はそのまま。各回の対象報酬・毎日スターを全回収する想定です。',
      '通常ログインとライブスタンプは別枠。イベント／シーズンPremiumには無料分を含まない追加スターだけを登録します。',
      'アワーノーツパスは期限ごとに継続購入。購入時スター÷更新日数×7＋毎日スター×7。無料ガチャ・チケット・素材・シールは換算しません。',
      '円価格はアワーノーツパスのみ30日換算した参考額です。イベント／シーズンPremiumの料金は含みません。',
      'スターの合算条件: ' + ({ unconfirmed: '未確認', 'assumed-usable': '合算可能と仮定', 'confirmed-usable': '合算可能と確認（登録者の申告）', restricted: '利用制約あり・収支保留' }[d.starCompatibility]) + (d.starCompatibilityBasis ? ' / ' + d.starCompatibilityBasis : ''),
      '週平均は資金繰りや獲得タイミングを保証しません。実開催日程・日時別残高・購入の最適化は扱いません。',
    ],
  };
}
