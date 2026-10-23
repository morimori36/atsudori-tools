import type { Masterdata } from './model';
import { tableFields, tableKeys } from './fields';
import type { CatalogTable, FieldKind } from './fields';

export const CATALOG_LIMIT = 10 * 1024 * 1024;
export function jsonValue(text: string, limit: number): unknown {
  if (new TextEncoder().encode(text).length > limit) throw new Error('JSONが大きすぎます');
  try { return JSON.parse(text, (key, value: unknown) => {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('危険なキー');
    return value;
  }); } catch { throw new Error('JSONとして読み込めません（構文または危険なキー）'); }
}
function fail(path: string, reason: string): never { throw new Error(path + ': ' + reason); }
export function strictObject(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'オブジェクトが必要です');
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) if (!keys.includes(key)) fail(path + '.' + key, '未対応の項目です');
  for (const key of keys) if (!Object.hasOwn(row, key)) fail(path + '.' + key, '必須項目がありません');
  return row;
}
function integer(v: unknown, p: string, min: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min) fail(p, '安全な整数（' + min + '以上）が必要です');
  return v;
}
function read(v: unknown, p: string, kind: FieldKind): unknown {
  if (kind === 'integer' || kind === 'zeroInteger') return integer(v, p, kind === 'integer' ? 1 : 0);
  if (kind === 'text') {
    if (typeof v !== 'string' || !v.trim() || v.length > 200) fail(p, '1〜200文字の文字列が必要です');
    return v;
  }
  if (kind === 'stats') {
    const row = strictObject(v, p, ['performance','technic','visual']);
    return Object.fromEntries(Object.entries(row).map(([k,n]) => [k, integer(n, p + '.' + k, 0)]));
  }
  if (!Array.isArray(v) || !v.length || v.length > 10000 || (kind === 'pair' && v.length !== 2)) fail(p, '空でない整数配列が必要です（pairは2要素）');
  const ns = v.map((n,i) => integer(n, p + '[' + i + ']', 1));
  if (kind !== 'pair' && new Set(ns).size !== ns.length) fail(p, '重複値があります');
  return ns;
}
const identity = (v: unknown, path: string): string => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(v)) fail(path, '英数字・ピリオド・ハイフン・下線の1〜80文字が必要です');
  return v;
};
/** Structure validation permits an explicit draft. Missing relationships are never filled in. */
export function validateCatalog(value: unknown): Masterdata {
  const keys = ['format','schemaVersion','catalogId','revision', ...Object.keys(tableFields)];
  const root = strictObject(value, '$', keys);
  if (root.format !== 'atsudori-tools/catalog') fail('$.format', 'catalog形式ではありません');
  if (root.schemaVersion !== 1) fail('$.schemaVersion', '未対応の形式です。明示的な変換が必要です');
  identity(root.catalogId, '$.catalogId'); identity(root.revision, '$.revision');
  let total = 0;
  const result: Record<string, unknown> = { format: root.format, schemaVersion: 1, catalogId: root.catalogId, revision: root.revision };
  for (const [table, fields] of Object.entries(tableFields)) {
    const values = root[table]; const path = '$.' + table;
    if (!Array.isArray(values) || values.length > 20000 || (total += values.length) > 50000) fail(path, '配列が必要です（全体50000行、表20000行以内）');
    const ids = new Set<string>();
    result[table] = values.map((v, i) => {
      const p = path + '[' + i + ']';
      const row = table === 'characterRankLevels' ? { value: integer(v, p, 1) }
        : Object.fromEntries(Object.entries(strictObject(v, p, Object.keys(fields))).map(([k,n]) => [k, read(n, p + '.' + k, fields[k as keyof typeof fields] as FieldKind)]));
      const key = tableKeys[table as CatalogTable].map(k => row[k]).join(':');
      if (ids.has(key)) fail(p, '複合キーが重複しています: ' + key);
      ids.add(key);
      return table === 'characterRankLevels' ? row.value : row;
    });
  }
  return result as unknown as Masterdata;
}
export function emptyCatalog(): Masterdata {
  return validateCatalog({ format:'atsudori-tools/catalog', schemaVersion:1, catalogId:'local', revision:'1',
    ...Object.fromEntries(Object.keys(tableFields).map(k => [k, []])) });
}
/** Completeness/semantics gate for imports and calculation. Draft editing is a separate path. */
export function catalogIssues(m: Masterdata): string[] {
  const issues: string[] = [];
  const need = (ok: boolean, p: string, text: string): void => { if (!ok && issues.length < 100) issues.push(p + ': ' + text); };
  const exists = (rows: readonly {id:number}[], id: number) => rows.some(r => r.id === id);
  for (const c of m.characters) need(exists(m.bands,c.bandId), 'characters/' + c.id, '参照バンドがありません');
  if (m.members.length) need(m.characterRankLevels.length > 0, 'characterRankLevels', '合法ランクがありません');
  for (const c of m.members) {
    const p = 'members/' + c.id;
    need(exists(m.characters,c.characterId), p, '参照キャラクターがありません');
    const training = m.memberTraining.filter(r => r.group === c.trainingGroup);
    const awakening = m.memberAwakening.filter(r => r.group === c.awakeningGroup);
    const levels = m.memberLevels.filter(r => r.group === c.levelGroup);
    need(training.length > 0,p,'特訓率がありません'); need(awakening.length > 0,p,'覚醒率がありません'); need(levels.length > 0,p,'Lv率がありません');
    for (const t of training) {
      const cap = m.memberLevelLimits.find(r => r.rarity === c.rarity && r.trainingStage === t.stage);
      need(Boolean(cap),p + '/training/' + t.stage,'Lv上限がありません');
      if (cap) need(levels.some(l => l.level === cap.limitLevel),p + '/training/' + t.stage,'上限Lvの率がありません');
    }
    for (const a of awakening) need(a.leaderSkillLevel === a.stage,p + '/awakening/' + a.stage,'Aと覚醒段階の連動に未対応です');
    const character = m.characters.find(r => r.id === c.characterId);
    if (character) need(m.bandItems.some(r => r.bandId === character.bandId), p, '対象バンドのアイテム定義がありません（補正なしと推測しません）');
    for (const row of [...levels,...awakening]) for (const ch of ['performance','technic','visual'] as const)
      need(Number.isSafeInteger(c.maxStats[ch] * row.rates[ch]) && c.maxStats[ch] * row.rates[ch] <= 2147483647,p,'Lv/覚醒の積が対応数値範囲を超えます');
  }
  for (const c of m.snaps) {
    const p = 'snaps/' + c.id;
    for (const id of c.characterIds) need(exists(m.characters,id),p,'参照キャラクターがありません: ' + id);
    const levels = m.snapLevels.filter(r => r.group === c.levelGroup);
    const ranks = m.snapRanks.filter(r => r.group === c.rankGroup);
    need(levels.length > 0,p,'Lv率がありません'); need(ranks.length > 0,p,'上限解放行がありません');
    for (const r of ranks) {
      need(levels.some(l => l.level === r.limitLevel),p + '/rank/' + r.rank,'上限Lvの率がありません');
      need(r.supportSkillLevels.every(l => l === r.rank),p + '/rank/' + r.rank,'UとサポートLvの連動に未対応です');
    }
    for (const row of levels) for (const ch of ['performance','technic','visual'] as const)
      need(Number.isSafeInteger(c.maxPercentBp[ch] * row.rates[ch]) && c.maxPercentBp[ch] * row.rates[ch] <= 2147483647,p,'Snapの積が対応数値範囲を超えます');
  }
  for (const i of m.bandItems) {
    const p = 'bandItems/' + i.id;
    need(exists(m.bands,i.bandId),p,'参照バンドがありません');
    need(m.bandItemLevels.some(l => l.itemId === i.id),p,'合法Lv行がありません');
  }
  for (const l of m.bandItemLevels) {
    const p = 'bandItemLevels/' + l.itemId + '/' + l.level;
    need(exists(m.bandItems,l.itemId),p,'参照アイテムがありません');
    need(m.bandItemEffects.some(e => e.itemId === l.itemId && e.level === l.level),p,'効果行がありません');
  }
  for (const e of m.bandItemEffects) {
    const p = 'bandItemEffects/' + e.itemId + '/' + e.level;
    need(m.bandItemLevels.some(l => l.itemId === e.itemId && l.level === e.level),p,'合法Lv行がありません');
    const item = m.bandItems.find(i => i.id === e.itemId);
    const target = m.skillTargets.find(t => t.id === e.targetIds[0]);
    need(e.effectType === 1000 && e.targetIds.length === 1 && Boolean(target) && target?.targetType === 3
      && target.bandId === item?.bandId && target.characterId === 0 && target.cardType === 0 && target.tagId === 0,p,'未対応または不明な効果対象です');
    need(e.valueBp % 10 === 0,p,'0.1%単位で表現できない効果率です');
  }
  for (const t of m.skillTargets) need(exists(m.bands,t.bandId),'skillTargets/' + t.id,'参照バンドがありません');
  return issues;
}
export function importCatalog(text: string): Masterdata {
  const m = validateCatalog(jsonValue(text,CATALOG_LIMIT));
  const issues = catalogIssues(m);
  if (issues.length) throw new Error('catalogの不足・不整合:\n' + issues.join('\n'));
  return m;
}
export function exportCatalog(m: Masterdata): string { return JSON.stringify(validateCatalog(m),null,2) + '\n'; }
