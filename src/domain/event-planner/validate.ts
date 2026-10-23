import { CHALLENGE_RANKS, EVENT_FORMAT, MAX_CANDIDATES, MAX_SEARCH_UNITS, NORMAL_RANKS } from './model';
import type { EventPlannerInput } from './model';

export const EVENT_JSON_LIMIT = 64 * 1024;
const fail = (label: string, detail: string): never => { throw new Error(`${label}${detail}`); };
function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label, 'はオブジェクトで指定してください');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(row, key)))
    fail(label, 'の項目が不足しているか、未対応の項目があります');
  return row;
}
function integer(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    fail(label, `は${min}〜${max.toLocaleString('ja-JP')}の整数で入力してください`);
}
// Parse the decimal representation, so a binary floating point product cannot move a floor boundary.
export function hundredths(value: number): bigint {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function decimal(value: unknown, label: string, positive = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (positive && value === 0)
    || !/^\d+(?:\.\d{1,2})?$/.test(String(value)) || hundredths(value) > BigInt(Number.MAX_SAFE_INTEGER))
    fail(label, `は${positive ? '0より大きい' : '0以上の'}数値を小数2桁以内で入力してください`);
}
export function validateEventInput(value: unknown): EventPlannerInput {
  const row = object(value, ['format', 'schemaVersion', 'targetPt', 'currentPt', 'currentCP', 'normalMultiplier', 'minutesPerRun', 'maxUnits', 'normal', 'challenge', 'bases'], '周回プランナーJSON');
  if (row.format !== EVENT_FORMAT || row.schemaVersion !== 1) fail('周回プランナーJSON', 'の形式・versionには対応していません');
  for (const [key, label] of [['targetPt', '目標イベントpt'], ['currentPt', '現在イベントpt'], ['currentCP', '現在CP']] as const) integer(row[key], label);
  integer(row.normalMultiplier, '通常ライブ倍率', 1);
  decimal(row.minutesPerRun, '1周あたり時間', true);
  integer(row.maxUnits, '探索上限', 0, MAX_SEARCH_UNITS);
  for (const [kind, ranks, label] of [['normal', NORMAL_RANKS, '通常'], ['challenge', CHALLENGE_RANKS, 'チャレンジ']] as const) {
    const candidates = row[kind];
    if (!Array.isArray(candidates) || candidates.length > MAX_CANDIDATES) fail(label + '候補', 'は最大5件です');
    (candidates as unknown[]).forEach((candidate, index) => {
      const name = `${label}候補${index + 1}`;
      const c = object(candidate, ['name', 'enabled', 'rank', 'bonus'], name);
      if (typeof c.name !== 'string' || c.name.length > 200) fail(name + 'の名前', 'は200文字以内で入力してください');
      if (typeof c.enabled !== 'boolean') fail(name + 'の使用設定', 'が不正です');
      if (!(ranks as readonly unknown[]).includes(c.rank)) fail(name + 'のランク', 'が不正です');
      decimal(c.bonus, name + 'のボーナス');
    });
  }
  const bases = object(row.bases, ['normal', 'challenge'], 'ランク基準');
  for (const [kind, ranks, label] of [['normal', NORMAL_RANKS, '通常'], ['challenge', CHALLENGE_RANKS, 'チャレンジ']] as const) {
    const table = object(bases[kind], ranks, `${label}ランク基準`);
    for (const rank of ranks) {
      const base = object(table[rank], kind === 'normal' ? ['pt', 'cp'] : ['pt'], `${label} ${rank}`);
      integer(base.pt, `${label} ${rank}の基本pt`);
      if (kind === 'normal') integer(base.cp, `${label} ${rank}の基本CP`);
    }
  }
  return structuredClone(value) as EventPlannerInput;
}
export function importEventInput(text: string): EventPlannerInput {
  if (new TextEncoder().encode(text).length > EVENT_JSON_LIMIT) fail('JSON', 'は64KiB以内にしてください');
  let value: unknown;
  try { value = JSON.parse(text); } catch { return fail('JSON', 'を読み取れません'); }
  return validateEventInput(value);
}
export function exportEventInput(value: EventPlannerInput): string {
  return JSON.stringify(validateEventInput(value), null, 2) + '\n';
}
