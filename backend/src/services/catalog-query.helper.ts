/**
 * Catalog query helpers used by catalog.service.
 *
 * Extracted so the main service file stays inside the 350-line guideline.
 * Pure functions; no Mongo I/O here.
 */

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

  if (query.inStockOnly) {
    clauses.push({
      $or: [
        { stockLimit: null },
        { $expr: { $lt: ['$stockUsed', '$stockLimit'] } },
      ],
    });
  }

  return clauses;
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
