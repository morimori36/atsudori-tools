import { strictObject } from '../../data/json';
import { PASS_GRADES, PRODUCT_IDS, PRODUCT_NAMES } from './model';
import type { BudgetValue, StarBudgetInput, StarBudgetDefinition, StarBudgetScenario } from './model';

const fail = (path: string, message: string): never => { throw new Error(path + ': ' + message); };
function text(value: unknown, path: string, max = 300, required = false): void {
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) fail(path, '文字列の長さ・内容を確認してください');
}
function integer(value: unknown, path: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail(path, '範囲内の安全な整数が必要です');
}
function measure(value: unknown, path: string, kind: 'integer' | 'positive' | 'days' = 'integer'): void {
  const m = strictObject(value, path, ['value', 'status', 'basis']);
  if (typeof m.status !== 'string' || !['unconfirmed', 'assumed', 'confirmed'].includes(m.status)) fail(path, '根拠の区分が不正です');
  text(m.basis, path + '.basis');
  if (m.value === null) {
    if (m.status !== 'unconfirmed') fail(path, '未入力の値は未確認として扱ってください');
    return;
  }
  if (kind === 'days') {
    if (typeof m.value !== 'number' || !Number.isFinite(m.value) || m.value <= 0 || !/^\d+(?:\.\d{1,2})?$/.test(String(m.value))
      || m.value > Number.MAX_SAFE_INTEGER / 100) fail(path, '日数は0より大きい数を小数2桁以内で入力してください');
  } else integer(m.value, path, kind === 'positive' ? 1 : 0);
  if (m.status === 'unconfirmed' || !(m.basis as string).trim()) fail(path, '入力値には仮定／確認済みの区分と根拠が必要です');
}
function measures(value: unknown, path: string, keys: readonly string[], dayKey?: string): void {
  const row = strictObject(value, path, keys);
  for (const key of keys) measure(row[key], path + '.' + key, key === dayKey ? 'days' : 'integer');
}
export function validateStarBudget(value: unknown): StarBudgetInput {
  const root = strictObject(value, 'スター予算', ['definition', 'scenario']);
  const definition = validateStarBudgetDefinition(root.definition);
  const combined = strictObject(root.scenario, 'scenario', ['rank', 'storyEventPercent', 'eventPremium', 'seasonPremium', 'includeArena', 'selectedProducts'], ['rank', 'storyEventPercent', 'eventPremium', 'seasonPremium', 'selectedProducts']);
  if (combined.rank !== null) integer(combined.rank, 'rank', 1);
  const { rank, ...scenario } = combined;
  return { definition, scenario: { ...validateStarBudgetScenario(scenario), rank: rank as number | null } };
}
export function validateStarBudgetDefinition(value: unknown): StarBudgetDefinition {
  const d = strictObject(value, 'definition', ['revision', 'loginDaily', 'missionDaily', 'liveStampWeekly', 'liveStampSelection', 'event', 'season', 'arena', 'passes', 'starCompatibility', 'starCompatibilityBasis', 'products'], ['revision', 'loginDaily', 'missionDaily', 'liveStampWeekly', 'liveStampSelection', 'event', 'season', 'passes', 'starCompatibility', 'starCompatibilityBasis', 'products']);
  if (typeof d.revision !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(d.revision)) fail('definition.revision', '版の識別子が不正です');
  for (const key of ['loginDaily', 'missionDaily', 'liveStampWeekly']) measure(d[key], 'definition.' + key);
  text(d.liveStampSelection, 'definition.liveStampSelection');
  measures(d.event, 'event', ['intervalDays', 'points', 'missionFree', 'missionPremium', 'storyPerEpisode', 'storyEpisodes'], 'intervalDays');
  measures(d.season, 'season', ['intervalDays', 'free', 'premium'], 'intervalDays');
  const passes = strictObject(d.passes, 'passes', PASS_GRADES);
  for (const grade of PASS_GRADES) measures(passes[grade], 'passes.' + grade, ['periodDays', 'purchaseStars', 'dailyStars', 'priceYen'], 'periodDays');
  if (typeof d.starCompatibility !== 'string' || !['unconfirmed', 'assumed-usable', 'confirmed-usable', 'restricted'].includes(d.starCompatibility)) fail('starCompatibility', '合算条件が不正です');
  text(d.starCompatibilityBasis, 'starCompatibilityBasis', 300, d.starCompatibility !== 'unconfirmed');
  if (!Array.isArray(d.products) || d.products.length !== PRODUCT_IDS.length) fail('products', '全11商品の定義が必要です');
  const ids: unknown[] = [];
  for (const [index, product] of (d.products as unknown[]).entries()) {
    const path = 'products[' + index + ']', row = strictObject(product, path, ['id', 'name', 'unlockRank', 'tiers']);
    if (!PRODUCT_IDS.includes(row.id as never) || ids.includes(row.id)) fail(path, '商品枠が未対応または重複しています');
    ids.push(row.id);
    text(row.name, path + '.name', 200, true);
    measure(row.unlockRank, path + '.unlockRank', 'positive');
    if (!Array.isArray(row.tiers) || row.tiers.length < 1 || row.tiers.length > 20) fail(path + '.tiers', '価格段階は1〜20段階で指定してください');
    for (const [i, tier] of (row.tiers as unknown[]).entries()) measures(tier, path + '.tiers[' + i + ']', ['starCost', 'weeklyLimit']);
  }
  const names = (d.products as { name: string }[]).map(p => p.name.trim());
  if (new Set(names).size !== names.length) fail('products', '商品・対象バンドを区別できる異なる名前を指定してください');
  // Discard only the named legacy field; never modify the caller's JSON.
  const { arena: _legacyArena, ...definition } = d;
  return structuredClone(definition) as unknown as StarBudgetDefinition;
}
export function validateStarBudgetScenario(value: unknown): StarBudgetScenario {
  const s = strictObject(value, 'scenario', ['storyEventPercent', 'eventPremium', 'seasonPremium', 'includeArena', 'selectedProducts'], ['storyEventPercent', 'eventPremium', 'seasonPremium', 'selectedProducts']);
  if (s.storyEventPercent !== null) integer(s.storyEventPercent, 'storyEventPercent', 0, 100);
  for (const key of ['eventPremium', 'seasonPremium']) if (typeof s[key] !== 'boolean') fail(key, 'ON/OFFで指定してください');
  if (!Array.isArray(s.selectedProducts) || s.selectedProducts.length > PRODUCT_IDS.length
    || new Set(s.selectedProducts).size !== s.selectedProducts.length
    || s.selectedProducts.some(id => !PRODUCT_IDS.includes(id as never))) fail('selectedProducts', '選択商品が未対応または重複しています');
  const { includeArena: _legacyIncludeArena, ...scenario } = s;
  return structuredClone(scenario) as unknown as StarBudgetScenario;
}
export const unknownBudgetValue = (): BudgetValue => ({ value: null, status: 'unconfirmed', basis: '' });
export function emptyStarBudget(): StarBudgetInput {
  const m = unknownBudgetValue;
  return {
    definition: { revision: '1', loginDaily: m(), missionDaily: m(), liveStampWeekly: m(), liveStampSelection: '',
      event: { intervalDays: m(), points: m(), missionFree: m(), missionPremium: m(), storyPerEpisode: m(), storyEpisodes: m() },
      season: { intervalDays: m(), free: m(), premium: m() },
      passes: Object.fromEntries(PASS_GRADES.map(grade => [grade, { periodDays: m(), purchaseStars: m(), dailyStars: m(), priceYen: m() }])) as StarBudgetInput['definition']['passes'],
      starCompatibility: 'unconfirmed', starCompatibilityBasis: '',
      products: PRODUCT_IDS.map(id => ({ id, name: PRODUCT_NAMES[id], unlockRank: m(), tiers: [{ starCost: m(), weeklyLimit: m() }] })),
    },
    scenario: { rank: null, storyEventPercent: null, eventPremium: false, seasonPremium: false, selectedProducts: [...PRODUCT_IDS] },
  };
}
