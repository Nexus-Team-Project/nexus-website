/**
 * Cache seam for the catalog-search module.
 *
 * Every engine result flows through a CatalogSearchCache. The default binding
 * is the NoopCache (identical behavior to having no cache), so adding a real
 * cache later (e.g. Redis) means implementing this interface in one new file
 * and wiring it via setCatalogSearchCache at bootstrap - zero engine or caller
 * changes. No Redis dependency exists today by design.
 *
 * Keys derive from context + the normalized query + page, so tenant contexts,
 * the ecosystem catalog, and different queries never share entries. A future
 * implementation should use a short TTL (results embed offer documents that go
 * stale on offer writes) and may use `invalidate(prefix)` on write paths.
 */
import type { CatalogSearchRequest, CatalogSearchResult } from './types';

export interface CatalogSearchCache {
  get(key: string): Promise<CatalogSearchResult | undefined>;
  set(key: string, value: CatalogSearchResult): Promise<void>;
  /** Drops every entry whose key starts with the prefix (e.g. one context's). */
  invalidate(keyPrefix: string): Promise<void>;
}

/** The default binding: no caching, every request hits the engine. */
export class NoopCache implements CatalogSearchCache {
  async get(): Promise<CatalogSearchResult | undefined> { return undefined; }
  async set(): Promise<void> { /* intentionally empty */ }
  async invalidate(): Promise<void> { /* intentionally empty */ }
}

/**
 * Stable cache key for one request: context identity + the query fields that
 * change results. Override maps are NOT part of the key - they derive from the
 * tenantId, which is.
 */
export function searchCacheKey(request: CatalogSearchRequest): string {
  const { context, query } = request;
  const contextKey = context.kind === 'tenant' ? `tenant:${context.tenantId}` : 'ecosystem';
  const q = {
    search: query.search ?? '',
    category: query.category ?? '',
    stackable: query.stackable ?? '',
    offerTypes: query.offerTypes ?? [],
    priceMin: query.priceMin ?? null,
    priceMax: query.priceMax ?? null,
    tags: query.tags ?? [],
    inStockOnly: query.inStockOnly ?? false,
    sort: query.sort ?? '',
    page: query.page,
    limit: query.limit,
  };
  return `catalog-search:${contextKey}:${JSON.stringify(q)}`;
}
