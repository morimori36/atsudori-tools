import { trackedInventory } from '../domain/materials/tracking';
import { importCollection, exportCollection } from './collection';
import type { Collection } from './collection';
import type { Masterdata } from '../data/catalog/model';
import { validateCatalog, jsonValue, serializeCatalogForStorage, CATALOG_LIMIT } from '../data/catalog/validate';

export const STORAGE_KEY = 'atsudori-tools.collection.v1';
export const MATERIAL_INVENTORY_BACKUP_KEY = 'atsudori-tools.collection.before-material-tracking.v1';
export const CATALOG_STORAGE_KEY = 'atsudori-tools.catalog.v1';
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type JsonLoad<T> = { status: 'empty' } | { status: 'loaded'; value: T }
  | { status: 'invalid'; raw: string; error: string } | { status: 'unavailable'; error: string };
export type SaveResult = { status: 'saved' } | { status: 'failed'; error: string };
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
export function loadJson<T>(storage: StoragePort | undefined, key: string, parse: (raw: string) => T): JsonLoad<T> {
  if (!storage) return { status: 'unavailable', error: 'このブラウザでは保存を利用できません' };
  let raw: string | null;
  try { raw = storage.getItem(key); } catch (error) { return { status: 'unavailable', error: message(error) }; }
  if (raw === null) return { status: 'empty' };
  try { return { status: 'loaded', value: parse(raw) }; }
  catch (error) { return { status: 'invalid', raw, error: message(error) }; }
}
export function saveJson(storage: StoragePort | undefined, key: string, text: () => string): SaveResult {
  if (!storage) return { status: 'failed', error: 'ブラウザ保存を利用できません。JSONをExportしてください' };
  try { storage.setItem(key, text()); return { status: 'saved' }; }
  catch (error) { return { status: 'failed', error: message(error) }; }
}
export function loadCollection(storage: StoragePort | undefined, master: Masterdata) {
  const result = loadJson(storage, STORAGE_KEY, text => importCollection(text, master));
  return result.status === 'loaded' ? { status: 'loaded' as const, collection: result.value } : result;
}
export function saveCollection(storage: StoragePort | undefined, collection: Collection, master: Masterdata): SaveResult {
  return saveJson(storage, STORAGE_KEY, () => {
    const output=exportCollection(collection,master);
    const raw=storage?.getItem(STORAGE_KEY);
    if(raw){
      // A corrupt original must never be overwritten as a side effect of migration.
      let inventory;
      try{inventory=importCollection(raw,{...master,materialDefinition:undefined}).resourceInventory??{};}
      catch{return output;} // Explicit recovery is controlled by the caller's write guard.
      if(Object.keys(inventory).length!==Object.keys(trackedInventory(inventory,master.materialDefinition)).length
        &&storage?.getItem(MATERIAL_INVENTORY_BACKUP_KEY)===null)storage.setItem(MATERIAL_INVENTORY_BACKUP_KEY,raw);
    }
    return output;
  });
}
export function loadCatalog(storage: StoragePort | undefined): JsonLoad<Masterdata> {
  // Drafts are explicitly supported in storage; imports require complete references.
  return loadJson(storage, CATALOG_STORAGE_KEY, text => validateCatalog(jsonValue(text, CATALOG_LIMIT)));
}
export function saveCatalog(storage: StoragePort | undefined, master: Masterdata): SaveResult {
  return saveJson(storage, CATALOG_STORAGE_KEY, () => serializeCatalogForStorage(master));
}
