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
 * Barcode `value`s created through the inventory popup / inventory route are the
 * PROVIDER-supplied strings (stored verbatim; rendered client-side as a barcode +
 * QR — the backend mints and renders nothing on that path). A link unit may also
 * carry an optional `code` (a plain coupon/redemption string paired with the
 * link, charset-restricted so it can never be an injection/XSS vector).
 *
 * NOTE (mock): the separate CSV bulk path still uses `mockBarcodeValue` to mint
 * placeholder barcode values ("MOCK-0001"); aligning it to provider strings is a
 * follow-up. The manual inventory route no longer mints anything.
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

/**
 * Optional per-link redemption/coupon code. Restricted to a safe charset so a
 * stored code can never carry script/markup or operator-injection payloads;
 * it is only ever shown as text / passed to the barcode-QR libs as data.
 */
export const VOUCHER_CODE_MAX_LENGTH = 128;
export const VOUCHER_CODE_REGEX = /^[A-Za-z0-9._\-/:+]{1,128}$/;

export type VoucherCodeKind = typeof VOUCHER_CODE_KINDS[number];
export type VoucherCodeStatus = typeof VOUCHER_CODE_STATUSES[number];

/**
 * One redeemable voucher unit.
 *   value  - the barcode string (provider-supplied) or the link URL.
 *   code   - OPTIONAL plain coupon/redemption code paired with a link unit
 *            (link kind only; charset-restricted). Unset for barcode units.
 *   status - 'available' on creation; advanced only by the future purchase flow.
 */
export const voucherCodeSchema = z.object({
  codeId: z.string().min(1),
  offerId: z.string().min(1),
  /**
   * The variant this unit belongs to (a voucher offer is a parent that holds one
   * or more variants; inventory is owned per variant). See `supply-variants.models.ts`.
   * Optional only so legacy units created before variants validate until the
   * migration stamps them; new units always set it.
   */
  variantId: z.string().min(1).optional(),
  kind: z.enum(VOUCHER_CODE_KINDS),
  value: z.string().min(1).max(2048),
  code: z.string().regex(VOUCHER_CODE_REGEX).optional(),
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
 * Idempotent indexes for voucherCodes (variant-scoped):
 *   (offerId, variantId, status)   - fast availability counts per variant.
 *   value (kind: 'barcode') unique - GLOBAL barcode uniqueness: a barcode string
 *       is a real-world redeemable code, so it must never exist twice anywhere
 *       (any variant/offer/tenant). Partial index so it applies only to barcodes.
 *   (offerId, variantId, value) (kind: 'link') unique - links are unique within a
 *       variant pool; the same URL may legitimately recur across variants/offers.
 *
 * NOTE (migration): the legacy `offer_value_unique` (offerId+value, all kinds) and
 * `offer_status` indexes are dropped by the variant backfill script after every
 * existing unit has a `variantId`. Creating these new indexes on a collection that
 * still holds duplicate barcodes across offers will fail - the backfill reports
 * such collisions for manual resolution first.
 *
 * Input: Mongo database handle. Output: indexes exist.
 */
export async function ensureVoucherCodeIndexes(db: Db): Promise<void> {
  const col = getVoucherCodeCollection(db);
  await Promise.all([
    col.createIndex(
      { offerId: 1, variantId: 1, status: 1 },
      { name: 'offer_variant_status' },
    ),
    col.createIndex(
      { value: 1 },
      {
        name: 'barcode_value_global_unique',
        unique: true,
        partialFilterExpression: { kind: 'barcode' },
      },
    ),
    col.createIndex(
      { offerId: 1, variantId: 1, value: 1 },
      {
        name: 'link_offer_variant_value_unique',
        unique: true,
        partialFilterExpression: { kind: 'link' },
      },
    ),
  ]);
}
