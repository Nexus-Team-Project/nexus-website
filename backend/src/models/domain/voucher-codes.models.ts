/**
 * MongoDB schema + accessors for voucher inventory units ("voucher codes").
 *
 * A voucher offer's redeemable inventory is a finite set of units, each a
 * barcode (a value we render later as a Code128 line barcode) or a redemption
 * link. Each unit is ONE document here — never embedded in the offer — so an
 * offer can hold thousands of units without bloating the offer document or
 * approaching MongoDB's 16 MB limit, and so a unit can later be assigned
 * atomically to a single buyer (the customer purchase/redemption flow is out
 * of scope for now; `status` defaults to 'available' and never advances yet).
 *
 * NOTE (mock): for now the barcode `value` is a simple placeholder string
 * (e.g. "MOCK-0001"), unique within an offer. A real Code128 / crypto-unique
 * minter replaces `mockBarcodeValue` later using the same collection + plumbing.
 */
import type { Db } from 'mongodb';
import { z } from 'zod';
import { DOMAIN_COLLECTIONS } from './collections';

/** A unit is either a generated barcode or a supplier-provided redemption link. */
export const VOUCHER_CODE_KINDS = ['barcode', 'link'] as const;

/**
 * Lifecycle of a unit. Only 'available' is used by this change; 'assigned' and
 * 'redeemed' are reserved for the future customer purchase/redemption flow.
 */
export const VOUCHER_CODE_STATUSES = ['available', 'assigned', 'redeemed'] as const;

/** Hard server-side cap on units created in a single inventory request. */
export const VOUCHER_INVENTORY_MAX = 10000;

export type VoucherCodeKind = typeof VOUCHER_CODE_KINDS[number];
export type VoucherCodeStatus = typeof VOUCHER_CODE_STATUSES[number];

/**
 * One redeemable voucher unit.
 *   value  - the barcode value (mock placeholder for now) or the link URL.
 *   status - 'available' on creation; advanced only by the future purchase flow.
 */
export const voucherCodeSchema = z.object({
  codeId: z.string().min(1),
  offerId: z.string().min(1),
  kind: z.enum(VOUCHER_CODE_KINDS),
  value: z.string().min(1).max(2048),
  status: z.enum(VOUCHER_CODE_STATUSES).default('available'),
  createdAt: z.date(),
});

export type VoucherCode = z.infer<typeof voucherCodeSchema>;

/**
 * MOCK barcode value generator. Produces "MOCK-0001"-style placeholders that
 * are unique within an offer when `index` is a monotonically increasing number
 * (the service continues numbering from the offer's current unit count).
 *
 * Input:  index - 1-based sequence number within the offer.
 * Output: a placeholder barcode value string.
 *
 * TODO(follow-up): replace with a real Code128-renderable, cryptographically
 * unique value (e.g. 12-char Crockford Base32 from crypto.randomBytes). The
 * collection, unique index, and bulk-insert plumbing stay the same.
 */
export function mockBarcodeValue(index: number): string {
  return `MOCK-${String(index).padStart(4, '0')}`;
}

/**
 * Returns the typed voucherCodes collection.
 * Input: connected MongoDB Db instance. Output: the voucherCodes collection.
 */
export function getVoucherCodeCollection(db: Db) {
  return db.collection<VoucherCode>(DOMAIN_COLLECTIONS.voucherCodes);
}

/**
 * Idempotent indexes for voucherCodes:
 *   (offerId, status) - fast availability counts per offer.
 *   (offerId, value)  - unique; the hard guard against duplicate values per offer.
 * Input: Mongo database handle. Output: indexes exist.
 */
export async function ensureVoucherCodeIndexes(db: Db): Promise<void> {
  const col = getVoucherCodeCollection(db);
  await Promise.all([
    col.createIndex({ offerId: 1, status: 1 }, { name: 'offer_status' }),
    col.createIndex({ offerId: 1, value: 1 }, { name: 'offer_value_unique', unique: true }),
  ]);
}
