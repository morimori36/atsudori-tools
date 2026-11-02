import type { CharacterMaster } from '../data/catalog/model';

/** Only for older rank/item layouts. Never use positions to interpret displayOrder. */
export function legacyProgressOrder<T>(rows: readonly T[]): T[] {
  return rows.length === 5 ? [rows[1]!, rows[3]!, rows[0]!, rows[4]!, rows[2]!] : [...rows];
}

/** Reorder each complete band using its catalog metadata, preserving band slots.
 * Pass the full character table even when displaying only a subset (e.g. a Snap).
 * Incomplete metadata is rejected, never completed from IDs, names or positions.
 */
export function characterDisplayOrder(characters: readonly CharacterMaster[]): CharacterMaster[] {
  const groups = new Map<number, CharacterMaster[]>();
  for (const character of characters) {
    if (!groups.has(character.bandId)) groups.set(character.bandId, []);
    groups.get(character.bandId)!.push(character);
  }
  for (const rows of groups.values()) {
    if (rows.every(c => c.displayOrder === undefined)) continue;
    if (rows.some(c => !Number.isSafeInteger(c.displayOrder) || c.displayOrder! < 0)
      || new Set(rows.map(c => c.displayOrder)).size !== rows.length) throw new Error('displayOrder: バンド内の表示順が不完全または不正です');
    rows.sort((a, b) => a.displayOrder! - b.displayOrder!);
  }
  const offsets = new Map<number, number>();
  return characters.map(c => {
    const offset = offsets.get(c.bandId) ?? 0;
    offsets.set(c.bandId, offset + 1);
    return groups.get(c.bandId)![offset]!;
  });
}

export function progressCharacters(characters: readonly CharacterMaster[]): CharacterMaster[] {
  return characters.every(c => c.displayOrder === undefined) ? legacyProgressOrder(characters) : characterDisplayOrder(characters);
}

/** Preserve the existing order of other views for a band without metadata. */
export function characterRowsForDisplay<T>(rows: readonly T[], characters: readonly CharacterMaster[], id: (row: T) => number): T[] {
  const metadata = new Map(characters.map(c => [c.id, c]));
  const order = new Map(characterDisplayOrder(characters).map((c, i) => [c.id, i]));
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const character = metadata.get(id(row))!;
    if (character.displayOrder === undefined) continue;
    if (!groups.has(character.bandId)) groups.set(character.bandId, []);
    groups.get(character.bandId)!.push(row);
  }
  for (const group of groups.values()) group.sort((a, b) => order.get(id(a))! - order.get(id(b))!);
  const offsets = new Map<number, number>();
  return rows.map(row => {
    const character = metadata.get(id(row))!;
    if (character.displayOrder === undefined) return row;
    const offset = offsets.get(character.bandId) ?? 0;
    offsets.set(character.bandId, offset + 1);
    return groups.get(character.bandId)![offset]!;
  });
}
