import { jsonValue, strictObject } from '../../data/catalog/validate';

export const PROFILE_LIMIT = 5 * 1024 * 1024;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Source = 'members' | 'snaps' | 'ranks' | 'items';
export type Template =
  | { op: 'literal'; value: Json }
  | { op: 'get'; path: string[] }
  | { op: 'object'; fields: Record<string, Template> }
  | { op: 'array' | 'concat' | 'text'; values: Template[] }
  | { op: 'map'; source: Source; body: Template; key?: Template }
  | { op: 'lookup'; values: Record<string, Json>; key: Template }
  | { op: 'ifNull'; value: Template; yes: Template; no: Template };
export type Shape =
  | { type: 'object'; properties: Record<string, Shape> }
  | { type: 'record'; values: Shape }
  | { type: 'array'; items: Shape; max: number }
  | { type: 'choice'; options: Shape[] }
  | { type: 'string'; decimal?: boolean; enum?: string[] }
  | { type: 'integer'; min: number; max: number }
  | { type: 'boolean' | 'null' };
export interface ConversionProfile {
  format: 'atsudori-tools/conversion-profile';
  schemaVersion: 2;
  engine: 'bounded-template/1';
  id: string;
  version: string;
  input: { format: 'atsudori-tools/collection'; schemaVersion: 1 };
  target: { format: string; version: string; definitionSha256: string };
  catalog: { catalogId: string; revision: string; sha256: string };
  provenance: { sources: { id: string; revision: string; sha256: string }[] };
  program: Template;
  output: Shape;
  checksum: string;
}
function fail(): never { throw new Error('変換プロファイルの未対応項目・不正値・処理上限を確認してください'); }
export const safeKey = (key: string): boolean => key.length > 0 && key.length <= 200 && !['__proto__','constructor','prototype'].includes(key);
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail();
  return v as Record<string, unknown>;
}
function keys(v: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  const r = record(v);
  if (Object.keys(r).some(k => !safeKey(k) || ![...required,...optional].includes(k)) || required.some(k => !Object.hasOwn(r,k))) fail();
  return r;
}
function text(v: unknown): asserts v is string { if (typeof v !== 'string' || !v.trim() || v.length > 400) fail(); }
function hash(v: unknown): void { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) fail(); }
function int(v: unknown, min: number, max: number): void { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) fail(); }
function list(v: unknown, max = 20000): unknown[] { if (!Array.isArray(v) || v.length > max) fail(); return v; }
const rowFields: Record<Source, string[]> = {
  members: ['cardId','level','trainingStage','awakeningStage','liveSkillLevel','gekisouSkillLevel'],
  snaps: ['supportCardId','level','rank'], ranks: ['id','value'], items: ['id','level','owned'],
};
function checkProgram(value: unknown): void {
  let nodes = 0;
  const visit = (v: unknown, depth: number, source?: Source): void => {
    if (++nodes > 6000 || depth > 24) fail();
    const r = record(v), child = (v: unknown) => visit(v,depth+1,source);
    switch (r.op) {
      case 'literal': keys(r,['op','value']); canonical(r.value); break;
      case 'get': {
        keys(r,['op','path']); const path = list(r.path,2);
        if (path.length !== 2 || !path.every(k => typeof k === 'string' && safeKey(k))) fail();
        if (!(path[0] === 'meta' && ['exportId','at','totalRank'].includes(String(path[1]))
          || path[0] === 'row' && source && rowFields[source].includes(String(path[1])))) fail();
        break;
      }
      case 'object': keys(r,['op','fields']); for (const [k,v] of Object.entries(record(r.fields))) { if (!safeKey(k)) fail(); child(v); } break;
      case 'array': case 'concat': case 'text': keys(r,['op','values']); list(r.values,100).forEach(child); break;
      case 'map': {
        keys(r,['op','source','body'],['key']);
        if (source || !Object.hasOwn(rowFields,String(r.source))) fail();
        visit(r.body,depth+1,r.source as Source);
        if (r.key !== undefined) visit(r.key,depth+1,r.source as Source);
        break;
      }
      case 'lookup': keys(r,['op','values','key']); canonical(record(r.values)); child(r.key); break;
      case 'ifNull': keys(r,['op','value','yes','no']); child(r.value); child(r.yes); child(r.no); break;
      default: fail();
    }
  };
  visit(value,0);
}
function checkShape(value: unknown, depth = 0, count = { n: 0 }): void {
  if (depth > 24 || ++count.n > 6000) fail();
  const r = record(value), child = (v: unknown) => checkShape(v,depth+1,count);
  switch (r.type) {
    case 'object': keys(r,['type','properties']); for (const [k,v] of Object.entries(record(r.properties))) { if (!safeKey(k)) fail(); child(v); } break;
    case 'record': keys(r,['type','values']); child(r.values); break;
    case 'array': keys(r,['type','items','max']); int(r.max,0,10000); child(r.items); break;
    case 'choice': keys(r,['type','options']); if (!list(r.options,5).length) fail(); list(r.options).forEach(child); break;
    case 'string': keys(r,['type'],['decimal','enum']); if (r.decimal !== undefined && typeof r.decimal !== 'boolean') fail(); if (r.enum !== undefined) { if (!list(r.enum,20).length) fail(); list(r.enum).forEach(text); } break;
    case 'integer': keys(r,['type','min','max']); int(r.min,0,Number.MAX_SAFE_INTEGER); int(r.max,Number(r.min),Number.MAX_SAFE_INTEGER); break;
    case 'boolean': case 'null': keys(r,['type']); break;
    default: fail();
  }
}
/** Stable JSON hashing. Object order is irrelevant; table/array order remains significant. */
export function canonical(value: unknown, depth = 0): string {
  if (depth > 40) fail();
  if (Array.isArray(value)) return '[' + value.map(v => canonical(v,depth+1)).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => {
    if (!safeKey(k)) fail(); return JSON.stringify(k) + ':' + canonical((value as Record<string,unknown>)[k],depth+1);
  }).join(',') + '}';
  if (value !== null && !['boolean','string','number'].includes(typeof value) || typeof value === 'number' && !Number.isSafeInteger(value)) fail();
  return JSON.stringify(value);
}
export async function digest(value: unknown): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function importProfile(raw: string): Promise<ConversionProfile> {
  const r = strictObject(jsonValue(raw,PROFILE_LIMIT),'profile',[
    'format','schemaVersion','engine','id','version','input','target','catalog','provenance','program','output','checksum']);
  if (r.format !== 'atsudori-tools/conversion-profile' || r.schemaVersion !== 2 || r.engine !== 'bounded-template/1') fail();
  text(r.id); text(r.version);
  const input = keys(r.input,['format','schemaVersion']);
  if (input.format !== 'atsudori-tools/collection' || input.schemaVersion !== 1) fail();
  const target = keys(r.target,['format','version','definitionSha256']);
  text(target.format); text(target.version); hash(target.definitionSha256);
  const catalog = keys(r.catalog,['catalogId','revision','sha256']); text(catalog.catalogId); text(catalog.revision); hash(catalog.sha256);
  const provenance = keys(r.provenance,['sources']);
  if (!list(provenance.sources,20).length) fail();
  const sourceIds = new Set<string>();
  for (const value of list(provenance.sources,20)) {
    const source = keys(value,['id','revision','sha256']); text(source.id); text(source.revision); hash(source.sha256);
    if (sourceIds.has(source.id)) fail(); sourceIds.add(source.id);
  }
  checkProgram(r.program); checkShape(r.output); hash(r.checksum);
  const {checksum,...payload} = r;
  if (await digest(payload) !== checksum) throw new Error('変換プロファイルのチェックサムが一致しません');
  return r as unknown as ConversionProfile;
}

export function renderTemplate(profile: ConversionProfile, data: Record<Source, Record<string, Json>[]>, meta: Record<string, Json>): Json {
  let steps = 0, units = 0;
  const charge = (n:number) => { units+=n; if(units>20_000_000) fail(); };
  const evaluate = (t: Template, row?: Record<string, Json>): Json => {
    if (++steps > 5_000_000) fail();
    switch (t.op) {
      case 'literal': charge(canonical(t.value).length); return structuredClone(t.value);
      case 'get': { const obj = t.path[0] === 'meta' ? meta : row; const key = t.path[1]!; if (!obj || !Object.hasOwn(obj,key)) fail(); return obj[key]!; }
      case 'object': return Object.fromEntries(Object.entries(t.fields).map(([k,v])=>{charge(k.length+4);return [k,evaluate(v,row)];}));
      case 'array': return t.values.map(v=>evaluate(v,row));
      case 'concat': return t.values.flatMap(v=>{ const result = evaluate(v,row); if (!Array.isArray(result)) fail(); return result; });
      case 'text': { const result=t.values.map(v=>{ const result = evaluate(v,row); if (result === null || typeof result === 'object') fail(); return String(result); }).join('');charge(result.length);return result; }
      case 'map': {
        if (!t.key) return data[t.source].map(r=>evaluate(t.body,r));
        const result: Record<string,Json> = {};
        for (const r of data[t.source]) { const key = evaluate(t.key,r); if (typeof key !== 'string' || !safeKey(key) || Object.hasOwn(result,key)) fail(); result[key] = evaluate(t.body,r); }
        return result;
      }
      case 'lookup': { const key = evaluate(t.key,row); if (typeof key !== 'string' || !Object.hasOwn(t.values,key)) throw new Error('変換プロファイルに対応する識別情報がありません'); charge(canonical(t.values[key]).length); return structuredClone(t.values[key]!); }
      case 'ifNull': return evaluate(evaluate(t.value,row) === null ? t.yes : t.no,row);
    }
  };
  const output = evaluate(profile.program);
  const matches = (value: Json, shape: Shape): boolean => {
    if (++steps > 5_000_000) fail();
    switch (shape.type) {
      case 'null': return value === null;
      case 'boolean': return typeof value === 'boolean';
      case 'integer': return typeof value === 'number' && Number.isSafeInteger(value) && value >= shape.min && value <= shape.max;
      case 'string': return typeof value === 'string' && value.length <= 1000 && (!shape.decimal || /^[1-9]\d*$/.test(value)) && (!shape.enum || shape.enum.includes(value));
      case 'choice': return shape.options.some(option=>matches(value,option));
      case 'array': return Array.isArray(value) && value.length <= shape.max && value.every(v=>matches(v,shape.items));
      case 'record': return !!value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([k,v])=>/^[1-9]\d*$/.test(k) && matches(v,shape.values));
      case 'object': return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === Object.keys(shape.properties).length
        && Object.entries(shape.properties).every(([k,s])=>Object.hasOwn(value,k) && matches(value[k]!,s));
    }
  };
  if (!matches(output,profile.output)) throw new Error('生成結果がプロファイルの出力定義に適合しません');
  return output;
}
