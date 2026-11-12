import { validateSealBudgetDefinition, sealBudgetIssues } from '../../domain/seal-budget/validate';
import { validateStarBudgetDefinition } from '../../domain/star-budget/validate';
import { validateMaterialDefinition, materialIssues } from '../../domain/materials/validate';
import { validateSupplyDefinition, supplyIssues } from '../../domain/economy/validate';
import type { Masterdata } from './model';
import { tableFields, tableKeys, optionalTableFields } from './fields';
import type { CatalogTable, FieldKind } from './fields';

export const CATALOG_LIMIT = 10 * 1024 * 1024;
import { jsonValue, strictObject } from '../json';
export { jsonValue, strictObject } from '../json';
import { validateRankDefinition, assertRankDefinitionCatalog } from '../../domain/character-rank/definition';
function fail(path: string, reason: string): never { throw new Error(path + ': ' + reason); }
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
  const root = strictObject(value, '$', [...keys,'rankDefinition','materialDefinition','supplyDefinition','starBudgetDefinition','sealBudgetDefinition','songClearCounts','stamps','skillCategories'],keys);
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
        : Object.fromEntries(Object.entries(strictObject(v, p, Object.keys(fields), Object.keys(fields).filter(k => !optionalTableFields[table as CatalogTable]?.includes(k)))).map(([k,n]) => [k, read(n, p + '.' + k, fields[k as keyof typeof fields] as FieldKind)]));
      const key = tableKeys[table as CatalogTable].map(k => row[k]).join(':');
      if (ids.has(key)) fail(p, '複合キーが重複しています: ' + key);
      ids.add(key);
      return table === 'characterRankLevels' ? row.value : row;
    });
  }
  if (root.skillCategories !== undefined) {
    if (!Array.isArray(root.skillCategories) || root.skillCategories.length > 20000 || (total += root.skillCategories.length) > 50000) fail('$.skillCategories', 'カテゴリ配列が必要です（表20000行、全体50000行以内）');
    const ids = new Set<number>();
    result.skillCategories = root.skillCategories.map((value, i) => {
      const path = '$.skillCategories[' + i + ']';
      const row = strictObject(value, path, ['id','kind','name']);
      const id = integer(row.id, path + '.id', 1);
      if (ids.has(id)) fail(path, 'カテゴリIDが重複しています');
      ids.add(id);
      if (typeof row.kind !== 'string' || !['live','gekisou','support','gekisouSupport'].includes(row.kind)) fail(path, '未対応のスキル系統です');
      return {id, kind: row.kind, name: read(row.name, path + '.name', 'text')};
    });
  }
  if (root.songClearCounts !== undefined) {
    const counts = root.songClearCounts;
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) fail('$.songClearCounts', 'オブジェクトが必要です');
    if (Object.keys(counts).length > 20000) fail('$.songClearCounts', '20000件以内で指定してください');
    result.songClearCounts = Object.fromEntries(Object.entries(counts).map(([id, count]) => {
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) fail('$.songClearCounts', '正規の正整数IDが必要です');
      return [id, integer(count, '$.songClearCounts.' + id, 0)];
    }));
  }
  if (root.stamps !== undefined) {
    if (!Array.isArray(root.stamps) || root.stamps.length > 20000 || (total += root.stamps.length) > 50000) fail('$.stamps', '配列が必要です（全体50000行、表20000行以内）');
    const ids = new Set<number>();
    result.stamps = root.stamps.map((value, i) => {
      const path = '$.stamps[' + i + ']';
      const row = strictObject(value, path, ['id','name','characterIds']);
      const id = integer(row.id, path + '.id', 1);
      if (ids.has(id)) fail(path, 'スタンプIDが重複しています');
      ids.add(id);
      if (!Array.isArray(row.characterIds) || row.characterIds.length > 10000) fail(path, '対象キャラは10000件以内の配列が必要です');
      const characterIds = row.characterIds.map((n, j) => integer(n, path + '.characterIds[' + j + ']', 1));
      if (new Set(characterIds).size !== characterIds.length) fail(path, '対象キャラが重複しています');
      return {id, name: read(row.name, path + '.name', 'text'), characterIds};
    });
  }
  if(root.rankDefinition !== undefined) result.rankDefinition=validateRankDefinition(root.rankDefinition);
  if(root.materialDefinition !== undefined) result.materialDefinition=validateMaterialDefinition(root.materialDefinition);
  if(root.supplyDefinition !== undefined) result.supplyDefinition=validateSupplyDefinition(root.supplyDefinition);
  if (root.sealBudgetDefinition !== undefined) {
    const definition=validateSealBudgetDefinition(root.sealBudgetDefinition);
    if(definition.revision!==root.revision)fail('$.sealBudgetDefinition.revision','catalogのrevisionと一致する必要があります');
    result.sealBudgetDefinition=definition;
  }
  if (root.starBudgetDefinition !== undefined) {
    const definition = validateStarBudgetDefinition(root.starBudgetDefinition);
    if (definition.revision !== root.revision) fail('$.starBudgetDefinition.revision', 'catalogのrevisionと一致する必要があります');
    result.starBudgetDefinition = definition;
  }
  return result as unknown as Masterdata;
}
export function emptyCatalog(): Masterdata {
  return validateCatalog({ format:'atsudori-tools/catalog', schemaVersion:1, catalogId:'local', revision:'1',
    ...Object.fromEntries(Object.keys(tableFields).map(k => [k, []])) });
}
/** Completeness/semantics gate for imports and calculation. Draft editing is a separate path. */
export function catalogIssues(m: Masterdata): string[] {
  const issues: string[] = [...materialIssues(m),...supplyIssues(m),...sealBudgetIssues(m)];
  const need = (ok: boolean, p: string, text: string): void => { if (!ok && issues.length < 100) issues.push(p + ': ' + text); };
  const exists = (rows: readonly {id:number}[], id: number) => rows.some(r => r.id === id);
  for (const [rows, fields] of [
    [m.members, [['liveSkillCategoryIds','live'],['gekisouSkillCategoryIds','gekisou']]],
    [m.snaps, [['supportSkillCategoryIds','support'],['gekisouSupportSkillCategoryIds','gekisouSupport']]],
  ] as const) for (const row of rows) for (const [field, kind] of fields) {
    const ids = (row as unknown as Record<string, number[] | undefined>)[field];
    for (const id of ids ?? []) need(Boolean(m.skillCategories?.some(c => c.id === id && c.kind === kind)), field + '/' + row.id, '同じ系統の参照スキルカテゴリがありません');
  }
  for (const id of Object.keys(m.songClearCounts ?? {})) need(exists(m.characters, Number(id)), 'songClearCounts/' + id, '参照キャラクターがありません');
  for (const stamp of m.stamps ?? []) for (const id of stamp.characterIds) need(exists(m.characters, id), 'stamps/' + stamp.id, '参照キャラクターがありません');
  for (const c of m.characters) need(exists(m.bands,c.bandId), 'characters/' + c.id, '参照バンドがありません');
  for (const table of ['characters', 'bandItems'] as const) for (const bandId of new Set(m[table].map(c => c.bandId))) {
    const rows = m[table].filter(c => c.bandId === bandId);
    const orders = rows.filter(c => c.displayOrder !== undefined).map(c => c.displayOrder!);
    if (!orders.length) continue;
    const path = table + '/band/' + bandId + '/displayOrder';
    need(orders.length === rows.length, path, 'バンド内の全行に表示順を指定してください');
    need(new Set(orders).size === orders.length, path, '表示順が重複しています');
  }
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
      need(Number.isSafeInteger(c.maxPercentBp[ch] * row.rates[ch]) && c.maxPercentBp[ch] * row.rates[ch] <= 2147483647,p,'スナップの積が対応数値範囲を超えます');
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
  if(m.rankDefinition) {
    try { assertRankDefinitionCatalog(m.rankDefinition,m); }
    catch(e) { need(false,'rankDefinition',e instanceof Error?e.message:'ランク定義が不正です'); }
  }
  return issues;
}
export function importCatalog(text: string): Masterdata {
  const m = validateCatalog(jsonValue(text,CATALOG_LIMIT));
  if(m.materialDefinition&&m.materialDefinition.trackingVersion!==1)throw new Error('素材の追跡範囲を定義したマスタをImportしてください。');
  const issues = catalogIssues(m);
  if (issues.length) throw new Error('catalogの不足・不整合:\n' + issues.join('\n'));
  return m;
}
function serializeCatalog(m: Masterdata, formatted: boolean): string {
  const value = validateCatalog(m);
  const readable = JSON.stringify(value, null, 2) + '\n';
  // The exported form must remain within the public 10 MiB limit even when storage is compact.
  if(new TextEncoder().encode(readable).length>CATALOG_LIMIT)throw new Error('マスタJSONの上限は10MiBです');
  return formatted ? readable : JSON.stringify(value);
}
export function exportCatalog(m: Masterdata): string {
  return serializeCatalog(m, true);
}
/** Browser persistence only. Keep exported files human-readable. */
export function serializeCatalogForStorage(m: Masterdata): string {
  return serializeCatalog(m, false);
}

/** Legacy hashes covered only the original catalog tables. Used solely for migration/compatibility. */
export function catalogBase(master: Masterdata): Omit<Masterdata,'rankDefinition'|'materialDefinition'|'supplyDefinition'> {
  const {rankDefinition,materialDefinition,supplyDefinition,...base}=validateCatalog(master);
  return base;
}
