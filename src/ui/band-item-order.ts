import type { BandItemMaster } from '../data/catalog/model';
import { legacyProgressOrder } from './character-order';

/** Pass the complete item group for one band. Metadata never changes stored order. */
export function bandItemsForDisplay(items: readonly BandItemMaster[]): BandItemMaster[] {
  if (items.every(item => item.displayOrder === undefined)) return legacyProgressOrder(items);
  if (items.some(item => !Number.isSafeInteger(item.displayOrder) || item.displayOrder! < 0)
    || new Set(items.map(item => item.displayOrder)).size !== items.length) {
    throw new Error('displayOrder: バンド内の表示順が不完全または不正です');
  }
  return [...items].sort((a, b) => a.displayOrder! - b.displayOrder!);
}
