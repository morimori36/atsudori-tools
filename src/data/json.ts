export function jsonValue(text: string, limit: number): unknown {
  if (new TextEncoder().encode(text).length > limit) throw new Error('JSONが大きすぎます');
  try { return JSON.parse(text, (key, value: unknown) => {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('危険なキー');
    return value;
  }); } catch { throw new Error('JSONとして読み込めません（構文または危険なキー）'); }
}
function fail(path: string, reason: string): never { throw new Error(path + ': ' + reason); }
export function strictObject(value: unknown, path: string, keys: readonly string[], required: readonly string[] = keys): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'オブジェクトが必要です');
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) if (!keys.includes(key)) fail(path + '.' + key, '未対応の項目です');
  for (const key of required) if (!Object.hasOwn(row, key)) fail(path + '.' + key, '必須項目がありません');
  return row;
}
