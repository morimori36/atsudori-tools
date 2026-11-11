import type { MaterialDefinition } from './model';
import type { ResourceInventory } from './inventory';

export const hasTrackingScope = (d:MaterialDefinition|undefined):boolean => d?.trackingVersion===1;
export const trackedResources = (d:MaterialDefinition|undefined) => hasTrackingScope(d)?d!.resources:[];
export const trackingUpdateMessage = '素材の追跡範囲を定義したマスタをImportしてください。';
/** Only explicitly retired IDs are removed. Unknown IDs retain backup protection. */
export function trackedInventory(inventory:ResourceInventory,d:MaterialDefinition|undefined):ResourceInventory {
  const excluded=new Set(d?.excludedResourceIds??[]);
  return Object.fromEntries(Object.entries(inventory).filter(([id])=>!excluded.has(id)));
}
