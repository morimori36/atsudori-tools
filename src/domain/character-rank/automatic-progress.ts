import type { Masterdata } from '../../data/catalog/model';
import type { Collection } from '../../storage/collection';

/** Catalog data and explicit ownership only; legacy numeric progress is unused. */
export function automaticCharacterProgress(master: Masterdata, collection: Collection, characterId: number) {
  const owned = new Set(collection.ownedStampIds ?? []);
  const stamps = new Set((master.stamps ?? []).filter(stamp => owned.has(stamp.id) && stamp.characterIds.includes(characterId)).map(stamp => stamp.id)).size;
  return { songClears: master.songClearCounts?.[characterId] ?? 0, stamps };
}
