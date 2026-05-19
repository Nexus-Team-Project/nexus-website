/**
 * Smoke check for catalog helper functions.
 * Not a real test framework - this is a CLI script you run with
 *   npm run smoke:catalog-filters
 * It asserts behavior for computeDisplayPrice, buildFilterClauses, and
 * buildSortMap, then exits 1 on any failure.
 *
 * Dev-only: refuses to run in production so an accidental invocation
 * never spends CPU or pollutes prod logs. The script has no side effects
 * regardless, but the guard makes intent explicit.
 */
import { strict as assert } from 'node:assert';
import { computeDisplayPrice } from '../src/services/supply-price.helper';
import { buildFilterClauses, buildSortMap } from '../src/services/catalog-query.helper';

// Refuse to run in production. Imports above are pure helpers with no
// side effects on load, so reaching this guard is cheap.
if (process.env.NODE_ENV === 'production') {
  console.log('smoke check is dev-only; skipping in production');
  process.exit(0);
}

// Voucher: always returns member_price even if market_price is set.
assert.equal(computeDisplayPrice('voucher', 80, 100), 80, 'voucher -> member_price');
assert.equal(computeDisplayPrice('voucher', 80, undefined), 80, 'voucher no market -> member_price');
assert.equal(computeDisplayPrice('voucher', undefined, 100), undefined, 'voucher no member -> undefined');

// Non-voucher: prefers market_price, falls back to member_price.
assert.equal(computeDisplayPrice('product', 80, 100), 100, 'product with both -> market_price');
assert.equal(computeDisplayPrice('product', 80, undefined), 80, 'product no market -> member_price');
assert.equal(computeDisplayPrice('product', undefined, 100), 100, 'product no member -> market_price');
assert.equal(computeDisplayPrice('product', undefined, undefined), undefined, 'product no prices -> undefined');

// Unknown execution type defaults to the non-voucher rule (safe forward-compat).
assert.equal(computeDisplayPrice(undefined, 80, 100), 100, 'undefined type -> market_price');
assert.equal(computeDisplayPrice('coupon', 80, 100), 100, 'coupon -> market_price');

console.log('[smoke] computeDisplayPrice OK');

// Empty query produces no clauses; default sort is newest.
assert.deepEqual(buildFilterClauses({ page: 1, limit: 25 }), []);
assert.deepEqual(buildSortMap(undefined), { createdAt: -1 });
assert.deepEqual(buildSortMap('newest'), { createdAt: -1 });

// Single filter clauses.
assert.deepEqual(
  buildFilterClauses({ page: 1, limit: 25, offerTypes: ['voucher', 'product'] }),
  [{ executionType: { $in: ['voucher', 'product'] } }],
);
assert.deepEqual(
  buildFilterClauses({ page: 1, limit: 25, priceMin: 10, priceMax: 100 }),
  [{ displayPrice: { $gte: 10, $lte: 100 } }],
);
assert.deepEqual(
  buildFilterClauses({ page: 1, limit: 25, priceMin: 10 }),
  [{ displayPrice: { $gte: 10 } }],
);
assert.deepEqual(
  buildFilterClauses({ page: 1, limit: 25, tags: ['gym', 'travel'] }),
  [{ tags: { $in: ['gym', 'travel'] } }],
);
assert.deepEqual(
  buildFilterClauses({ page: 1, limit: 25, inStockOnly: true }),
  [{ $or: [{ stockLimit: null }, { $expr: { $lt: ['$stockUsed', '$stockLimit'] } }] }],
);

// Sort modes.
assert.deepEqual(buildSortMap('price_asc'), { displayPrice: 1, createdAt: -1 });
assert.deepEqual(buildSortMap('price_desc'), { displayPrice: -1, createdAt: -1 });
assert.deepEqual(buildSortMap('expiry_soon'), { validUntil: 1, createdAt: -1 });
assert.deepEqual(buildSortMap('expiry_far'), { validUntil: -1, createdAt: -1 });

console.log('[smoke] catalog filter helpers OK');
