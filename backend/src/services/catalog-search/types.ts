/**
 * Catalog-search module contract.
 *
 * One narrow interface owns matching, filtering, sorting, and pagination for
 * the wallet catalog feeds. Callers (getMemberCatalogView,
 * getEcosystemCatalogView) depend ONLY on `searchCatalog` (see index.ts) and
 * these types - never on an engine (Atlas Search / regex fallback) or cache
 * implementation. Pricing projection and toItem mapping stay in the callers.
 */
import type { NexusOffer } from '../../models/domain/supply.models';
import type { CatalogQuery } from '../catalog.service';

/**
 * Per-tenant price override snapshot for one adopted offer, used by the JS
 * effective-value sorts (price + cashback). Mirrors the TenantOfferConfig
 * fields the member view already joins - the module never fetches configs
 * itself (the caller owns that join).
 */
export interface TenantPriceOverride {
  /** Cached per-tenant displayPrice (lowest effective variant price). */
  displayPrice?: number;
  /** Legacy offer-level absolute member price override. */
  memberPrice?: number;
  /** Per-variant absolute price overrides (variantId -> price). */
  variantPrices?: Record<string, number>;
}

/**
 * The catalog context a search runs in. Results are gated to it and cache
 * keys derive from it (tenant contexts and the Nexus catalog never share
 * entries).
 */
export type CatalogSearchContext =
  | {
      kind: 'tenant';
      tenantId: string;
      /** The tenant's adopted offer ids (adoption is the visibility gate). */
      adoptedOfferIds: string[];
      /** Price overrides by offerId, for effective price/cashback ordering. */
      overrides: Map<string, TenantPriceOverride>;
    }
  | { kind: 'ecosystem' };

/** One search request: where to look + the parsed catalog query. */
export interface CatalogSearchRequest {
  context: CatalogSearchContext;
  query: CatalogQuery;
}

/** Matched offer documents for one page + the total match count. */
export interface CatalogSearchResult {
  offers: NexusOffer[];
  total: number;
}

/** An interchangeable search engine implementation. */
export interface CatalogSearchEngine {
  /** Human-readable name, logged at startup so the active engine is visible. */
  readonly name: string;
  search(request: CatalogSearchRequest): Promise<CatalogSearchResult>;
}
