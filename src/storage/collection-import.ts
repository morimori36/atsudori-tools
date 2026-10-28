import type { Masterdata } from '../data/catalog/model';
import { validateCollection } from './collection';
import type { Collection } from './collection';

/** Replace ownership, retaining progress fields absent from the imported file by default. */
export function prepareCollectionImport(incoming: Collection, current: Collection, master: Masterdata,
  preserveMissingProgress = true): Collection {
  const next = validateCollection(incoming, master);
  if (!preserveMissingProgress) return next;
  const previous = validateCollection(current, master);
  const tgwRank = next.tgwRank ?? previous.tgwRank;
  const characterProgress = { ...previous.characterProgress };
  for (const [id, progress] of Object.entries(next.characterProgress ?? {})) {
    // Explicit values, including zero, win. Omission never means clearing a saved field.
    characterProgress[id] = { ...characterProgress[id], ...progress };
  }
  return validateCollection({ ...next, ...(previous.characterProgress === undefined && next.characterProgress === undefined ? {} : {characterProgress}), ...(tgwRank === undefined ? {} : {tgwRank}) }, master);
}
