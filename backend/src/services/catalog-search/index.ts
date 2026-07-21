/**
 * Catalog-search module entry - the ONLY import surface for callers.
 *
 * `searchCatalog` owns matching, filtering, sorting, and pagination for the
 * wallet catalog feeds. Engine selection (Atlas Search vs regex fallback) is
 * env-driven and invisible to callers; every result flows through the
 * CatalogSearchCache seam (NoopCache by default - a future Redis cache is one
 * new implementation wired via setCatalogSearchCache, zero caller changes).
 *
 * Callers keep everything downstream of matching: TenantOfferConfig joins,
 * pricing projection, nexus_cost stripping, and toItem mapping.
 */
import { env } from '../../config/env';
import { atlasEngine } from './atlas-engine';
import { regexEngine } from './regex-engine';
import { NoopCache, searchCacheKey, type CatalogSearchCache } from './cache';
import type {
  CatalogSearchContext,
  CatalogSearchEngine,
  CatalogSearchRequest,
  CatalogSearchResult,
  TenantPriceOverride,
} from './types';

export { ensureSearchIndexes } from './search-indexes';
export type {
  CatalogSearchContext,
  CatalogSearchRequest,
  CatalogSearchResult,
  TenantPriceOverride,
  CatalogSearchCache,
};

/** The env-selected engine (fixed per process; tests always get the fallback). */
const activeEngine: CatalogSearchEngine = env.ATLAS_SEARCH_ENABLED ? atlasEngine : regexEngine;

/** Cache binding - NoopCache unless bootstrap wires a real implementation. */
let cache: CatalogSearchCache = new NoopCache();

/** Swaps the cache implementation (e.g. Redis) at bootstrap. */
export function setCatalogSearchCache(implementation: CatalogSearchCache): void {
  cache = implementation;
}

/** Logged once at bootstrap so the active engine is visible per environment. */
export function catalogSearchEngineName(): string {
  return activeEngine.name;
}

/**
 * Runs one catalog search: cache lookup -> engine -> cache fill.
 * Input:  context (tenant with adopted ids + overrides, or ecosystem) + the
 *         parsed CatalogQuery.
 * Output: the matched offer documents for the requested page + total count.
 */
export async function searchCatalog(request: CatalogSearchRequest): Promise<CatalogSearchResult> {
  const key = searchCacheKey(request);
  const cached = await cache.get(key);
  if (cached) return cached;
  const result = await activeEngine.search(request);
  await cache.set(key, result);
  return result;
}
