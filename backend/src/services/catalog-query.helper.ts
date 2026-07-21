/**
 * Catalog query helpers used by catalog.service.
 *
 * Extracted so the main service file stays inside the 350-line guideline.
 * Pure functions, except buildInStockClause (voucher stock lives in
 * voucherCodes units, so it needs one distinct() pre-fetch).
 */
import type { Db } from 'mongodb';
import { getVoucherCodeCollection } from '../models/domain/voucher-codes.models';

/**
 * Builds a Mongo `$or` clause that matches the supplied search string against
 * an offer's title OR description using a case-insensitive `$regex`.
 *
 * Returns null when the input is empty/whitespace - callers should skip the
 * clause entirely in that case. Special regex characters are escaped so a
 * user typing "." or "(" does not crash the query or do anything surprising.
 *
 * Input:  raw - free-text search value from the request (may be undefined).
 * Output: a Mongo filter object suitable for `$and`/`$or` composition, or null.
 */
export function buildSearchFilter(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  // 200-char cap mirrors the Zod input cap and bounds regex compile cost.
  const trimmed = raw.trim().slice(0, 200);
  if (!trimmed) return null;
  // Mongo regex needs special-character escaping; mirrors the pattern used in
  // domain-member-read.service for member-list search to stay consistent.
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    $or: [
      { title: { $regex: escaped, $options: 'i' } },
      { description: { $regex: escaped, $options: 'i' } },
    ],
  };
}

// TYPE-ONLY import to avoid a value-level circular dependency. catalog.service.ts
// will import buildFilterClauses and buildSortMap from this file; importing
// CatalogQuery here as a type is safe because TypeScript erases type imports
// at compile time - no runtime circular reference is created.
import type { CatalogQuery } from './catalog.service';

/**
 * Translates the new CatalogQuery filter fields (offerTypes, priceMin/Max,
 * date ranges, tags, inStockOnly) into a list of Mongo $and clauses.
 *
 * Excluded from this helper: search and category (handled by buildSearchFilter
 * and an inline equality check), and the always-on visibility / status /
 * validFrom / validUntil base clauses (which belong to the view function
 * because they differ between admin and member).
 *
 * Returns an array (possibly empty). Callers spread it into their own
 * $and array.
 *
 * Input:  query - the parsed CatalogQuery from the request.
 * Output: array of Mongo filter documents ready to spread into a $and clause.
 */
export function buildFilterClauses(query: CatalogQuery): Array<Record<string, unknown>> {
  const clauses: Array<Record<string, unknown>> = [];

  if (query.offerTypes && query.offerTypes.length > 0) {
    clauses.push({ executionType: { $in: query.offerTypes } });
  }

  if (query.priceMin != null || query.priceMax != null) {
    const range: Record<string, number> = {};
    if (query.priceMin != null) range.$gte = query.priceMin;
    if (query.priceMax != null) range.$lte = query.priceMax;
    clauses.push({ displayPrice: range });
  }

  if (query.validFromAfter) {
    clauses.push({ validFrom: { $gte: query.validFromAfter } });
  }

  if (query.validUntilBefore) {
    clauses.push({ validUntil: { $lte: query.validUntilBefore } });
  }

  if (query.tags && query.tags.length > 0) {
    clauses.push({ tags: { $in: query.tags } });
  }

  // inStockOnly is NOT handled here: voucher stock lives in voucherCodes units
  // and needs an async pre-fetch - see buildInStockClause below, which the view
  // functions await and push themselves.

  return clauses;
}

/**
 * Builds the inStockOnly clause. Vouchers derive stock from their inventory
 * units (an offer is in stock when it has at least one AVAILABLE voucherCodes
 * unit - offer.stockLimit may be null/stale for variant vouchers, and null must
 * NOT read as "unlimited" for them). Non-voucher offers keep the legacy
 * semantics: null stockLimit = unlimited, else stockUsed < stockLimit.
 *
 * Async (unlike buildFilterClauses) because the voucher offerIds are resolved
 * with a distinct() pre-fetch.
 * ponytail: unindexed distinct on status - add a status index when the
 * voucherCodes collection grows past what a scan tolerates.
 *
 * Input:  db - the Mongo database handle.
 * Output: one Mongo $or clause ready to push into the view's $and array.
 */
export async function buildInStockClause(db: Db): Promise<Record<string, unknown>> {
  const inStockVoucherIds = await getVoucherCodeCollection(db)
    .distinct('offerId', { status: 'available' });
  return {
    $or: [
      { executionType: { $ne: 'voucher' }, stockLimit: null },
      { executionType: { $ne: 'voucher' }, $expr: { $lt: ['$stockUsed', '$stockLimit'] } },
      { executionType: 'voucher', offerId: { $in: inStockVoucherIds } },
    ],
  };
}

/** The minimal item shape markVoucherSoldOut needs to read + mutate. */
interface SoldOutMarkable {
  offerId: string;
  executionType?: string | null;
  isSoldOut: boolean;
}

/**
 * Sets `isSoldOut` on VOUCHER items from real voucherCodes availability (a
 * voucher offer is sold out when it has zero AVAILABLE units) - the offer-level
 * stockLimit toItem uses does not track voucher units. One distinct() over the
 * page's offerIds; non-voucher items are left untouched. Mutates in place.
 */
export async function markVoucherSoldOut<T extends SoldOutMarkable>(db: Db, items: T[]): Promise<T[]> {
  const voucherIds = items
    .filter((i) => (i.executionType ?? 'voucher') === 'voucher')
    .map((i) => i.offerId);
  if (voucherIds.length === 0) return items;
  const inStock = new Set(
    await getVoucherCodeCollection(db).distinct('offerId', {
      offerId: { $in: voucherIds },
      status: 'available',
    }),
  );
  for (const item of items) {
    if ((item.executionType ?? 'voucher') === 'voucher') item.isSoldOut = !inStock.has(item.offerId);
  }
  return items;
}

/**
 * Maps a CatalogQuery.sort value to a Mongo sort document. The default
 * (newest) matches the legacy behavior.
 *
 * For expiry_soon (validUntil ascending), Mongo's default null-ordering
 * puts nulls FIRST. We accept that for v1 because the member view already
 * filters validUntil > now, so non-expired offers with no expiry sort
 * before dated ones - acceptable for a tie-breaker. Eliminating
 * null-first ordering would need a $expr-based sort that loses index
 * support; not worth the cost.
 *
 * For expiry_far (descending), nulls naturally come last.
 *
 * Input:  sort - the sort mode string from CatalogQuery, or undefined for default.
 * Output: a Mongo sort document with field names and direction values (1 or -1).
 */
export function buildSortMap(
  sort: CatalogQuery['sort'],
): Record<string, 1 | -1> {
  switch (sort) {
    case 'price_asc':   return { displayPrice: 1, createdAt: -1 };
    case 'price_desc':  return { displayPrice: -1, createdAt: -1 };
    case 'expiry_soon': return { validUntil: 1, createdAt: -1 };
    case 'expiry_far':  return { validUntil: -1, createdAt: -1 };
    case 'newest':
    default:            return { createdAt: -1 };
  }
}
