import { exportEventInput, importEventInput } from '../domain/event-planner/validate';
import type { EventPlannerInput } from '../domain/event-planner/model';

// This module deliberately has no dependency on catalog, collection, or rating storage.
export const EVENT_STORAGE_KEY = 'atsudori-tools.event-planner.v1';
export interface EventStorage { getItem(key: string): string | null; setItem(key: string, text: string): void }
export type EventLoad = { status: 'empty' } | { status: 'loaded'; input: EventPlannerInput }
  | { status: 'invalid'; raw: string } | { status: 'unavailable' };
export function loadEventInput(storage: EventStorage | undefined): EventLoad {
  if (!storage) return { status: 'unavailable' };
  let raw: string | null;
  try { raw = storage.getItem(EVENT_STORAGE_KEY); } catch { return { status: 'unavailable' }; }
  if (raw === null) return { status: 'empty' };
  try { return { status: 'loaded', input: importEventInput(raw) }; }
  catch { return { status: 'invalid', raw }; }
}
export function saveEventInput(storage: EventStorage | undefined, input: EventPlannerInput): boolean {
  if (!storage) return false;
  try { storage.setItem(EVENT_STORAGE_KEY, exportEventInput(input)); return true; }
  catch { return false; }
}
