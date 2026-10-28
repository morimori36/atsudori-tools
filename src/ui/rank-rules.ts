import { catalogRankRules } from '../domain/character-rank/rules';
import type { BoundRankRules } from '../domain/character-rank/rules';
import type { Masterdata } from '../data/catalog/model';

/** Cache only the definition embedded in the current catalog. */
export function createRankRules(read: () => Masterdata) {
  let cacheKey = '', bound: BoundRankRules | undefined;
  function current(): BoundRankRules | undefined {
    const master = read(), key = JSON.stringify(master);
    if (key !== cacheKey) {
      bound = undefined;
      try { bound = catalogRankRules(master); } catch { /* Invalid catalogs suspend estimation. */ }
      cacheKey = key;
    }
    return bound;
  }
  return { current, labels: () => Object.fromEntries(current()?.document.manualProgress.map(p => [p.key, p.label]) ?? []) };
}
