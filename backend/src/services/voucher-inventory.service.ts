/**
 * Voucher inventory service - creates redeemable units (barcodes / links) for a
 * voucher VARIANT and keeps the offer's stock in sync with its inventory.
 *
 * A voucher offer is a parent that holds one or more variants; inventory is owned
 * PER VARIANT. Every unit carries `offerId` + `variantId`. Stored one document
 * per unit in `voucherCodes` (see voucher-codes.models). Adding inventory APPENDS
 * to any existing units of that variant (it never replaces them). After any
 * change the offer's `stockLimit` is set to the offer's TOTAL unit count across
 * all variants (the sum); `stockUsed` stays 0 (assigning/consuming units is the
 * out-of-scope customer flow).
 *
 * Uniqueness differs by kind (enforced by partial indexes, see
 * voucher-codes.models):
 *   - barcode `value` is GLOBALLY unique (a real-world redeemable code). A barcode
 *     that already exists ANYWHERE other than this same variant is a collision and
 *     is REPORTED + REJECTED (409), not silently skipped. A barcode already on
 *     THIS variant is an idempotent skip (edit/re-publish).
 *   - link `value` is unique within a variant; re-adding the same link to the same
 *     variant is tolerated (idempotent).
 *
 * Quantities are capped at VOUCHER_INVENTORY_MAX per request. Authorization +
 * ownership + voucher-only are enforced by the caller (route).
 */
import { randomUUID } from 'node:crypto';
import { getMongoDb } from '../config/mongo';
import { createError } from '../middleware/errorHandler';
import { getSupplyDomainCollections } from '../models/domain/supply.models';
import {
  getVoucherCodeCollection,
  mockBarcodeValue,
  VOUCHER_INVENTORY_MAX,
  type VoucherCode,
} from '../models/domain/voucher-codes.models';

/** Result of an inventory operation. */
export interface InventoryResult {
  /** Units actually created by this call (duplicates skipped). */
  created: number;
  /** The variant's total unit count after this call. */
  variantCount: number;
  /** The offer's total unit count after this call (its new stockLimit = sum of variants). */
  stockLimit: number;
}

/** Read-side summary of a VARIANT's inventory: link values + per-kind counts. */
export interface InventorySummary {
  /** All link-unit values for the variant (used to pre-fill the edit popup). */
  links: string[];
  /** Unit counts per kind for the variant. */
  counts: { barcode: number; link: number };
}

/**
 * Returns a variant's inventory summary: every link value + per-kind counts.
 * Barcode values are intentionally not returned (the edit popup only needs to
 * re-show links). Caller enforces admin + ownership + voucher-only.
 *
 * Input:  offerId, variantId. Output: { links, counts }.
 */
export async function getInventorySummary(
  offerId: string,
  variantId: string,
): Promise<InventorySummary> {
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const [linkDocs, barcodeCount, linkCount] = await Promise.all([
    codes.find({ offerId, variantId, kind: 'link' }, { projection: { value: 1, _id: 0 } }).toArray(),
    codes.countDocuments({ offerId, variantId, kind: 'barcode' }),
    codes.countDocuments({ offerId, variantId, kind: 'link' }),
  ]);
  return {
    links: linkDocs.map((d) => d.value),
    counts: { barcode: barcodeCount, link: linkCount },
  };
}

/** MongoDB duplicate-key error code. */
const DUPLICATE_KEY = 11000;

/**
 * Narrows an unknown thrown value to "all write failures were duplicate-key".
 * Used to tolerate re-inserting a value that already exists (unique index)
 * without failing the whole request. Barcodes pre-check collisions before insert,
 * so this only ever absorbs same-variant idempotent re-adds and races.
 */
function isOnlyDuplicateKeyError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: number; writeErrors?: Array<{ code?: number }> };
  if (e.code === DUPLICATE_KEY) return true;
  return Array.isArray(e.writeErrors) && e.writeErrors.length > 0
    && e.writeErrors.every((w) => w.code === DUPLICATE_KEY);
}

/**
 * Recomputes the offer's stockLimit from its total unit count across ALL variants.
 * Input: offerId. Output: the offer total unit count (also written to stockLimit).
 */
async function syncStockFromInventory(offerId: string): Promise<number> {
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const { nexusOffers } = getSupplyDomainCollections(db);
  const total = await codes.countDocuments({ offerId });
  await nexusOffers.updateOne(
    { offerId },
    { $set: { stockLimit: total, updatedAt: new Date() } },
  );
  return total;
}

/**
 * Bulk-inserts units for a variant, tolerating duplicate-key collisions (the
 * non-duplicate docs still insert because the write is unordered). Returns the
 * created count (by variant before/after) plus the variant + offer totals.
 */
async function appendUnits(
  offerId: string,
  variantId: string,
  docs: VoucherCode[],
): Promise<InventoryResult> {
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const before = await codes.countDocuments({ offerId, variantId });
  if (docs.length > 0) {
    try {
      await codes.insertMany(docs, { ordered: false });
    } catch (err) {
      if (!isOnlyDuplicateKeyError(err)) throw err;
    }
  }
  const variantCount = await codes.countDocuments({ offerId, variantId });
  const stockLimit = await syncStockFromInventory(offerId);
  return { created: variantCount - before, variantCount, stockLimit };
}

/**
 * One-kind-per-variant guard. A variant's inventory must be exactly one kind -
 * links (with optional codes) OR barcodes, never both. Throws 409 when the
 * variant already has units of the OTHER kind. Different variants of the same
 * offer may independently use different kinds. Authoritative server-side guard.
 */
async function assertKindMatches(
  offerId: string,
  variantId: string,
  kind: 'barcode' | 'link',
): Promise<void> {
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const other = kind === 'barcode' ? 'link' : 'barcode';
  const otherCount = await codes.countDocuments({ offerId, variantId, kind: other });
  if (otherCount > 0) {
    throw createError(
      `This variant already has ${other} inventory; a variant can hold only one kind (barcodes or links).`,
      409,
    );
  }
}

/**
 * Appends provider-supplied barcode strings as barcode units to a variant.
 * Barcodes are GLOBALLY unique: a value that already exists under any other
 * offer/variant is reported and rejected (409); a value already on THIS variant
 * is an idempotent skip. De-duplicates within the batch and caps at
 * VOUCHER_INVENTORY_MAX. Stores strings verbatim; the client renders barcode + QR.
 *
 * Input:  offerId, variantId, values (1..VOUCHER_INVENTORY_MAX non-empty strings).
 * Output: InventoryResult. Throws 400 (empty/over cap), 409 (kind mismatch or
 *         global barcode collision listing the colliding values).
 */
export async function addBarcodes(
  offerId: string,
  variantId: string,
  values: string[],
): Promise<InventoryResult> {
  if (!Array.isArray(values) || values.length < 1 || values.length > VOUCHER_INVENTORY_MAX) {
    throw createError(`barcodes must contain between 1 and ${VOUCHER_INVENTORY_MAX} values`, 400);
  }
  // Combine duplicate values into one (keep first occurrence) rather than failing.
  const unique = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
  await assertKindMatches(offerId, variantId, 'barcode');

  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  // Global uniqueness pre-check: find any existing barcode with these values.
  const existing = await codes
    .find(
      { kind: 'barcode', value: { $in: unique } },
      { projection: { value: 1, offerId: 1, variantId: 1, _id: 0 } },
    )
    .toArray();
  const foreign = existing.filter((e) => e.offerId !== offerId || e.variantId !== variantId);
  if (foreign.length > 0) {
    const list = foreign.map((e) => e.value).join(', ');
    throw createError(`These barcodes already exist and must be globally unique: ${list}`, 409);
  }
  // Values already on THIS variant are idempotent skips; insert only the rest.
  const own = new Set(existing.map((e) => e.value));
  const toInsert = unique.filter((v) => !own.has(v));
  const now = new Date();
  const docs: VoucherCode[] = toInsert.map((value) => ({
    codeId: randomUUID(),
    offerId,
    variantId,
    kind: 'barcode',
    value,
    status: 'available',
    createdAt: now,
  }));
  return appendUnits(offerId, variantId, docs);
}

/**
 * Generates `n` mock barcode units for a variant and appends them. Values
 * continue numbering from the variant's current unit count. Caps at
 * VOUCHER_INVENTORY_MAX. Used only by the CSV bulk path (a freshly created
 * single-variant offer, so its mock values are globally unique by construction);
 * the manual route uses addBarcodes (provider strings).
 *
 * Input:  offerId, variantId, n (1..VOUCHER_INVENTORY_MAX).
 * Output: InventoryResult. Throws Error(status 400) when n is out of range.
 */
export async function generateBarcodes(
  offerId: string,
  variantId: string,
  n: number,
): Promise<InventoryResult> {
  if (!Number.isInteger(n) || n < 1 || n > VOUCHER_INVENTORY_MAX) {
    throw createError(`quantity must be between 1 and ${VOUCHER_INVENTORY_MAX}`, 400);
  }
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const existing = await codes.countDocuments({ offerId, variantId });
  const now = new Date();
  // Mock values are namespaced by offerId so they stay globally unique across
  // offers (the global barcode-value index would otherwise collide on MOCK-0001).
  const prefix = offerId.slice(0, 8);
  const docs: VoucherCode[] = Array.from({ length: n }, (_, i) => ({
    codeId: randomUUID(),
    offerId,
    variantId,
    kind: 'barcode',
    value: `${prefix}-${mockBarcodeValue(existing + i + 1)}`,
    status: 'available',
    createdAt: now,
  }));
  return appendUnits(offerId, variantId, docs);
}

/** A link inventory item: the URL plus an optional paired code. */
export interface LinkItem {
  url: string;
  /** Optional coupon/redemption code paired with the link (charset-restricted upstream). */
  code?: string;
}

/**
 * Appends link units (each with an optional paired `code`) to a variant. Items
 * are de-duplicated by URL within the batch; URLs already present on the variant
 * are skipped via the unique index.
 *
 * Input:  offerId, variantId, items (1..VOUCHER_INVENTORY_MAX link items).
 * Output: InventoryResult. Throws 400 when empty/over cap, 409 on kind mismatch.
 */
export async function addLinks(
  offerId: string,
  variantId: string,
  items: LinkItem[],
): Promise<InventoryResult> {
  if (!Array.isArray(items) || items.length < 1 || items.length > VOUCHER_INVENTORY_MAX) {
    throw createError(`links must contain between 1 and ${VOUCHER_INVENTORY_MAX} URLs`, 400);
  }
  await assertKindMatches(offerId, variantId, 'link');
  const byUrl = new Map<string, LinkItem>();
  for (const item of items) { if (!byUrl.has(item.url)) byUrl.set(item.url, item); }
  const now = new Date();
  const docs: VoucherCode[] = Array.from(byUrl.values()).map((item) => ({
    codeId: randomUUID(),
    offerId,
    variantId,
    kind: 'link',
    value: item.url,
    ...(item.code ? { code: item.code } : {}),
    status: 'available',
    createdAt: now,
  }));
  return appendUnits(offerId, variantId, docs);
}
