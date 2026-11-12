import type { Masterdata } from '../data/catalog/model';
import { validateCollection } from './collection';
import type { Collection } from './collection';

/** Replace ownership, retaining progress fields absent from the imported file by default. */
export function prepareCollectionImport(incoming: Collection, current: Collection, master: Masterdata,
  preserveMissingProgress = true): Collection {
  const next = validateCollection(incoming, master);
  if (!preserveMissingProgress) return next;
  const previous = validateCollection(current, master);
  const supplyConditions = next.supplyConditions ?? previous.supplyConditions;
  const starBudgetScenario = next.starBudgetScenario ?? previous.starBudgetScenario;
  const tgwRank = next.tgwRank ?? previous.tgwRank;
  // An omitted field from a daily import preserves manual ownership. An explicit
  // array (including []) replaces it, allowing deliberate backup restoration.
  const ownedStampIds = next.ownedStampIds ?? previous.ownedStampIds;
  const resourceInventory = next.resourceInventory ?? previous.resourceInventory;
  const characterProgress = { ...previous.characterProgress };
  for (const [id, progress] of Object.entries(next.characterProgress ?? {})) {
    // Explicit values, including zero, win. Omission never means clearing a saved field.
    characterProgress[id] = { ...characterProgress[id], ...progress };
  }
  return validateCollection({ ...next, ...(supplyConditions === undefined ? {} : {supplyConditions}), ...(starBudgetScenario === undefined ? {} : {starBudgetScenario}), ...(resourceInventory===undefined?{}:{resourceInventory}), ...(ownedStampIds === undefined ? {} : {ownedStampIds}), ...(previous.characterProgress === undefined && next.characterProgress === undefined ? {} : {characterProgress}), ...(tgwRank === undefined ? {} : {tgwRank}) }, master);
}
