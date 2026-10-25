import { storedProgressFields } from '../domain/character-rank/definitions';
import type { CharacterProgress } from '../domain/character-rank/definitions';
import { jsonValue } from '../data/catalog/validate';
import type { Stats } from '../domain/rating/calculate';
import type { Masterdata } from '../data/catalog/model';
import { deriveMemberDisplay, deriveSnapDisplay } from '../data/catalog/growth';
import type { MemberProgression, SnapProgression } from '../data/catalog/growth';

export interface OwnedMember extends MemberProgression {
  liveSkillLevel: number;
  gekisouSkillLevel: number;
  /** Legacy v1 field retained for JSON compatibility; unused in collection calculations. */
  displayedStatsOverride?: Stats;
}
export interface Collection {
  format: 'atsudori-tools/collection';
  schemaVersion: 1;
  catalogId: string;
  members: OwnedMember[];
  snaps: SnapProgression[];
  /** Explicit manual overrides only. Estimates are derived, never saved here. */
  characterRanks: Record<string, number>;
  characterProgress?: Record<string, CharacterProgress>;
  /** Explicit total-rank parameter bonus override; missing uses imported rules, never a default. */
  totalRankBonus?: number;
  /** Missing = unknown; null = explicitly unowned; positive integer = owned level. */
  bandItems: Record<string, number | null>;
}
export function emptyCollection(master: Masterdata): Collection {
  return { format: 'atsudori-tools/collection', schemaVersion: 1,
    catalogId: master.catalogId, members: [], snaps: [], characterRanks: {}, bandItems: {} };
}
function fail(path: string, message: string): never { throw new Error(`${path}: ${message}`); }
function object(value: unknown, path: string, allowed?: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'オブジェクトが必要です');
  const result = value as Record<string, unknown>;
  if (allowed) for (const key of Object.keys(result)) {
    if (!allowed.includes(key)) fail(`${path}.${key}`, 'このschemaでは扱わない項目です');
  }
  return result;
}
function integer(value: unknown, path: string, minimum = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail(path, `整数（${minimum}以上）が必要です`);
  return value;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || value.length > 20000) fail(path, '20000行以内の配列が必要です');
  return value;
}
function manualStats(value: unknown, path: string): Stats {
  const r = object(value, path, ['performance', 'technic', 'visual']);
  return { performance: integer(r.performance, `${path}.performance`, 0),
    technic: integer(r.technic, `${path}.technic`, 0), visual: integer(r.visual, `${path}.visual`, 0) };
}
function record<T>(value: unknown, path: string, read: (id: number, v: unknown, path: string) => T): Record<string, T> {
  const r = object(value, path);
  const entries = Object.entries(r).map(([key, v]) => {
    if (!/^[1-9]\d*$/.test(key) || !Number.isSafeInteger(Number(key))) fail(`${path}.${key}`, '正規の正整数IDが必要です');
    return [key, read(Number(key), v, `${path}.${key}`)] as const;
  });
  return Object.fromEntries(entries);
}
function unique(rows: readonly number[], path: string): void {
  if (new Set(rows).size !== rows.length) fail(path, '同じカードIDが重複しています');
}

/** Validates both the versioned shape and legal progression against the registered catalog. */
export function validateCollection(value: unknown, master: Masterdata): Collection {
  const root = object(value, '$', ['format', 'schemaVersion', 'catalogId', 'members', 'snaps', 'characterRanks', 'characterProgress', 'bandItems', 'totalRankBonus']);
  if (root.format !== 'atsudori-tools/collection') fail('$.format', 'このツールの所持データではありません');
  if (root.schemaVersion !== 1) fail('$.schemaVersion', '未対応の保存形式です。変換が必要です');
  const characterProgress = root.characterProgress === undefined ? undefined : record(root.characterProgress, '$.characterProgress', (id, value, path) => {
    if (!master.characters.some(c => c.id === id)) fail(path, '現在のcatalogにないキャラクターです');
    const values = object(value, path, Object.keys(storedProgressFields));
    return Object.fromEntries(Object.entries(values).map(([key, value]) =>
      [key as keyof CharacterProgress, integer(value, `${path}.${key}`, 0)])) as CharacterProgress;
  });
  if (root.catalogId !== master.catalogId && (root.totalRankBonus !== undefined || array(root.members, '$.members').length || array(root.snaps, '$.snaps').length || Object.keys(object(root.characterRanks, '$.characterRanks')).length || Object.keys(object(root.bandItems, '$.bandItems')).length || Object.keys(characterProgress ?? {}).length)) fail('$.catalogId', 'catalogIdが異なります。対応するcatalogを登録してください');
  if (typeof root.catalogId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(root.catalogId)) fail('$.catalogId', '識別子が必要です');
  const members = array(root.members, '$.members').map((value, i): OwnedMember => {
    const path = `$.members[${i}]`;
    const r = object(value, path, ['cardId', 'level', 'trainingStage', 'awakeningStage', 'liveSkillLevel', 'gekisouSkillLevel', 'displayedStatsOverride']);
    const member: OwnedMember = {
      cardId: integer(r.cardId, `${path}.cardId`), level: integer(r.level, `${path}.level`),
      trainingStage: integer(r.trainingStage, `${path}.trainingStage`), awakeningStage: integer(r.awakeningStage, `${path}.awakeningStage`),
      liveSkillLevel: integer(r.liveSkillLevel, `${path}.liveSkillLevel`), gekisouSkillLevel: integer(r.gekisouSkillLevel, `${path}.gekisouSkillLevel`),
    };
    const card = master.members.find(m => m.id === member.cardId);
    if (!card) fail(`${path}.cardId`, '現在のcatalogにないIDです');
    if (!card.liveSkillLevels.includes(member.liveSkillLevel)) fail(`${path}.liveSkillLevel`, '対応するスキルLv行がありません');
    if (!card.gekisouSkillLevels.includes(member.gekisouSkillLevel)) fail(`${path}.gekisouSkillLevel`, '対応するスキルLv行がありません');
    try { const display = deriveMemberDisplay(master, member); for (const [key,value] of Object.entries(display.displayedStats)) integer(value, path + '.derived.' + key, 0); }
    catch (error) { fail(path, `育成状態が不正です（${error instanceof Error ? error.message : String(error)}）`); }
    if (r.displayedStatsOverride !== undefined) member.displayedStatsOverride = manualStats(r.displayedStatsOverride, `${path}.displayedStatsOverride`);
    return member;
  });
  unique(members.map(r => r.cardId), '$.members');
  const snaps = array(root.snaps, '$.snaps').map((value, i): SnapProgression => {
    const path = `$.snaps[${i}]`;
    const r = object(value, path, ['supportCardId', 'level', 'rank']);
    const snap = { supportCardId: integer(r.supportCardId, `${path}.supportCardId`), level: integer(r.level, `${path}.level`), rank: integer(r.rank, `${path}.rank`) };
    try { deriveSnapDisplay(master, snap); }
    catch (error) { fail(path, `Snapの育成状態が不正です（${error instanceof Error ? error.message : String(error)}）`); }
    return snap;
  });
  unique(snaps.map(r => r.supportCardId), '$.snaps');
  const characterRanks = record(root.characterRanks, '$.characterRanks', (id, value, path) => {
    if (!master.characters.some(c => c.id === id)) fail(path, '現在のcatalogにないキャラクターです');
    const rank = integer(value, path);
    // Retain structurally valid manual overrides even when the current catalog lacks a rank row.
    // Calculation/export validates catalog support without destroying saved ownership.
    return rank;
  });
  const bandItems = record(root.bandItems, '$.bandItems', (id, value, path) => {
    if (!master.bandItems.some(item => item.id === id)) fail(path, '現在のcatalogにないアイテムです');
    if (value === null) return null;
    const level = integer(value, path);
    if (!master.bandItemLevels.some(row => row.itemId === id && row.level === level)) fail(path, '合法な所持Lv行がありません');
    return level;
  });
  return { ...emptyCollection(master), members, snaps, characterRanks, ...(characterProgress === undefined ? {} : {characterProgress}), bandItems,
    ...(root.totalRankBonus === undefined ? {} : {totalRankBonus:integer(root.totalRankBonus,'$.totalRankBonus',0)}) };
}

export function importCollection(text: string, master: Masterdata): Collection {
  if (text.length > 5 * 1024 * 1024) fail('$', 'JSONが大きすぎます（上限5MB）');
  return validateCollection(jsonValue(text, 5 * 1024 * 1024), master);
}
export function exportCollection(collection: Collection, master: Masterdata): string {
  return JSON.stringify(validateCollection(collection, master), null, 2) + '\n';
}
