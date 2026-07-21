/**
 * Shared query building blocks for both catalog-search engines.
 *
 * Everything here is engine-agnostic: the context gates (what an offer must
 * satisfy to be visible at all - NEVER search-scored, so a fuzzy match can
 * never leak a gated offer), the user filters, the sort plan, and the JS
 * effective-value comparators for the sorts Mongo cannot express (per-tenant
 * effective price/cashback, nulls-last cashback ascending).
 *
 * Pure except buildUserFilterClauses (inStockOnly needs the async voucher
 * stock pre-fetch, reused from catalog-query.helper).
 */
import type { Db } from 'mongodb';
import { NOT_DELETED, type NexusOffer } from '../../models/domain/supply.models';
import { buildFilterClauses, buildInStockClause, buildSortMap } from '../catalog-query.helper';
import { variantCashbackPct, baseCashbackFields } from '../offer-search-fields.helper';
import type { CatalogQuery } from '../catalog.service';
import type { CatalogSearchContext, TenantPriceOverride } from './types';

/**
 * The always-on visibility gates for a context: adopted set / ecosystem
 * visibility, active status, not deleted, and an open validity window.
 */
export function buildContextGates(
  context: CatalogSearchContext,
  now: Date,
): Array<Record<string, unknown>> {
  return [
    context.kind === 'tenant'
      ? { offerId: { $in: context.adoptedOfferIds } }
      : { visibility: 'ecosystem' },
    { status: 'active' },
    NOT_DELETED,
    { $or: [{ validFrom: null }, { validFrom: { $exists: false } }, { validFrom: { $lte: now } }] },
    { $or: [{ validUntil: null }, { validUntil: { $exists: false } }, { validUntil: { $gte: now } }] },
  ];
}

/**
 * The user-selected filters: category + the shared clause builder (offer
 * types, price range, validity bounds, tags, stackable) + async stock.
 */
export async function buildUserFilterClauses(
  db: Db,
  query: CatalogQuery,
): Promise<Array<Record<string, unknown>>> {
  const clauses: Array<Record<string, unknown>> = [];
  if (query.category) clauses.push({ category: query.category });
  clauses.push(...buildFilterClauses(query));
  if (query.inStockOnly) clauses.push(await buildInStockClause(db));
  return clauses;
}

/** How the matched set gets ordered + paginated. */
export type SortPlan =
  /** Preserve the engine's relevance order (Atlas $search score). */
  | { mode: 'score' }
  /** Mongo-side sort (index-friendly), optional Hebrew collation. */
  | { mode: 'mongo'; sort: Record<string, 1 | -1>; collation?: { locale: string } }
  /** Fetch-all + JS sort for effective per-tenant values / nulls-last. */
  | { mode: 'js'; compare: (a: NexusOffer, b: NexusOffer) => number };

/**
 * Decides the sort plan for a request.
 *   Relevant (no sort) - score order while searching (when the engine scores),
 *                        newest otherwise.
 *   price_*            - JS effective-price sort (per-tenant overrides).
 *   cashback_desc      - ecosystem: Mongo sort on the stored base max (nulls
 *                        last naturally, index-backed); tenant: JS effective.
 *   cashback_asc       - JS both (Mongo ascending would put nulls FIRST).
 *   title_asc          - Mongo sort with Hebrew collation.
 *   expiry/newest      - Mongo sort via the shared map.
 */
export function planSort(
  context: CatalogSearchContext,
  query: CatalogQuery,
  engineScores: boolean,
): SortPlan {
  const sort = query.sort;
  if (sort === undefined || sort === 'newest') {
    if (query.search?.trim() && engineScores && sort === undefined) return { mode: 'score' };
    return { mode: 'mongo', sort: buildSortMap('newest') };
  }
  if (sort === 'price_asc' || sort === 'price_desc') {
    const direction = sort === 'price_asc' ? 1 : -1;
    return { mode: 'js', compare: effectiveValueComparator(context, 'price', direction) };
  }
  if (sort === 'cashback_desc') {
    if (context.kind === 'ecosystem') return { mode: 'mongo', sort: buildSortMap('cashback_desc') };
    return { mode: 'js', compare: effectiveValueComparator(context, 'cashback', -1) };
  }
  if (sort === 'cashback_asc') {
    return { mode: 'js', compare: effectiveValueComparator(context, 'cashback', 1) };
  }
  if (sort === 'title_asc') {
    return { mode: 'mongo', sort: buildSortMap('title_asc'), collation: { locale: 'he' } };
  }
  return { mode: 'mongo', sort: buildSortMap(sort) };
}

/** Effective (per-tenant) display price: override cache -> offer base. */
export function effectivePrice(offer: NexusOffer, override: TenantPriceOverride | undefined): number {
  return override?.displayPrice ?? offer.displayPrice ?? 0;
}

/**
 * Effective cashback range for one offer in a context. Ecosystem/no-override
 * offers read the stored base fields (computed live for pre-backfill docs);
 * tenant overrides recompute per variant with the overridden prices.
 * Returns min/max integer percent, or null when nothing yields cashback.
 */
export function effectiveCashbackRange(
  offer: NexusOffer,
  override: TenantPriceOverride | undefined,
): { min: number | null; max: number | null } {
  const hasOverride =
    override !== undefined
    && ((override.variantPrices && Object.keys(override.variantPrices).length > 0)
      || override.memberPrice !== undefined);
  if (!hasOverride) {
    if (offer.cashbackMinPct !== undefined && offer.cashbackMaxPct !== undefined) {
      return { min: offer.cashbackMinPct, max: offer.cashbackMaxPct };
    }
    const base = baseCashbackFields(offer.variants, offer.face_value, offer.member_price);
    return { min: base.cashbackMinPct, max: base.cashbackMaxPct };
  }
  const variants = offer.variants ?? [];
  const pcts = (variants.length > 0
    ? variants.map((v) =>
        variantCashbackPct(v.face_value, override.variantPrices?.[v.variantId] ?? v.member_price))
    : [variantCashbackPct(offer.face_value, override.memberPrice ?? offer.member_price)]
  ).filter((p): p is number => p !== undefined);
  if (pcts.length === 0) return { min: null, max: null };
  return { min: Math.min(...pcts), max: Math.max(...pcts) };
}

/**
 * Comparator for the JS sorts. Cashback anchors on the range MAX descending /
 * MIN ascending; offers without cashback sort LAST in both directions. Ties
 * break newest-first (matches the Mongo-side tie-breaker).
 */
function effectiveValueComparator(
  context: CatalogSearchContext,
  kind: 'price' | 'cashback',
  direction: 1 | -1,
): (a: NexusOffer, b: NexusOffer) => number {
  const overrideOf = (offer: NexusOffer): TenantPriceOverride | undefined =>
    context.kind === 'tenant' ? context.overrides.get(offer.offerId) : undefined;
  const keyOf = (offer: NexusOffer): number => {
    if (kind === 'price') return effectivePrice(offer, overrideOf(offer));
    const range = effectiveCashbackRange(offer, overrideOf(offer));
    const anchor = direction === -1 ? range.max : range.min;
    // No cashback -> always last: -Infinity when sorting descending, +Infinity ascending.
    if (anchor === null) return direction === -1 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    return anchor;
  };
  return (a, b) => {
    const av = keyOf(a);
    const bv = keyOf(b);
    if (av !== bv) return (av - bv) * direction;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  };
}
