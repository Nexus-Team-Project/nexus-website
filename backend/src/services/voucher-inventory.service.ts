/**
 * Voucher inventory service - creates redeemable units (barcodes / links) for a
 * voucher offer and keeps the offer's stock in sync with its inventory.
 *
 * Inventory is stored one document per unit in `voucherCodes` (see
 * voucher-codes.models). Adding inventory APPENDS to any existing units (it
 * never replaces them), so an admin can edit/re-publish a voucher to add more
 * without invalidating previously created units. After any change the offer's
 * `stockLimit` is set to the offer's TOTAL unit count; `stockUsed` stays 0
 * (assigning/consuming units is the out-of-scope customer flow).
 *
 * Barcode VALUES are mock placeholders for now (see mockBarcodeValue); links
 * are the real URLs the admin provided. Quantities are capped at
 * VOUCHER_INVENTORY_MAX. Authorization + ownership are enforced by the caller
 * (route) - this service trusts the offerId it is given.
 */
import { randomUUID } from 'node:crypto';
import { getMongoDb } from '../config/mongo';
import { getSupplyDomainCollections } from '../models/domain/supply.models';
import {
  getVoucherCodeCollection,
  mockBarcodeValue,
  VOUCHER_INVENTORY_MAX,
  type VoucherCode,
} from '../models/domain/voucher-codes.models';

/** Result of an inventory operation: how many units were created + the new stock total. */
export interface InventoryResult {
  /** Units actually created by this call (duplicates within the offer are skipped). */
  created: number;
  /** The offer's total unit count after this call (its new stockLimit). */
  stockLimit: number;
}

/** MongoDB duplicate-key error code. */
const DUPLICATE_KEY = 11000;

/**
 * Narrows an unknown thrown value to "all write failures were duplicate-key".
 * Used to tolerate re-inserting a value that already exists for the offer
 * (unique (offerId, value) index) without failing the whole request.
 */
function isOnlyDuplicateKeyError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: number; writeErrors?: Array<{ code?: number }> };
  if (e.code === DUPLICATE_KEY) return true;
  return Array.isArray(e.writeErrors) && e.writeErrors.length > 0
    && e.writeErrors.every((w) => w.code === DUPLICATE_KEY);
}

/**
 * Recomputes the offer's stockLimit from its total unit count.
 * Input: offerId. Output: the total unit count (also written to stockLimit).
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
 * Bulk-inserts units, tolerating duplicate-(offerId,value) collisions (the
 * non-duplicate docs still insert because the write is unordered). Returns the
 * offer's unit count before the insert so the caller can compute how many were
 * actually added. Re-throws any non-duplicate error.
 */
async function appendUnits(offerId: string, docs: VoucherCode[]): Promise<InventoryResult> {
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const before = await codes.countDocuments({ offerId });
  try {
    await codes.insertMany(docs, { ordered: false });
  } catch (err) {
    if (!isOnlyDuplicateKeyError(err)) throw err;
  }
  const stockLimit = await syncStockFromInventory(offerId);
  return { created: stockLimit - before, stockLimit };
}

/**
 * Generates `n` mock barcode units for an offer and appends them.
 * Values continue numbering from the offer's current unit count so appended
 * units stay unique within `(offerId, value)`. Caps at VOUCHER_INVENTORY_MAX.
 *
 * Input:  offerId, n (1..VOUCHER_INVENTORY_MAX).
 * Output: InventoryResult. Throws Error(status 400) when n is out of range.
 */
export async function generateBarcodes(offerId: string, n: number): Promise<InventoryResult> {
  if (!Number.isInteger(n) || n < 1 || n > VOUCHER_INVENTORY_MAX) {
    throw Object.assign(new Error(`quantity must be between 1 and ${VOUCHER_INVENTORY_MAX}`), { status: 400 });
  }
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const existing = await codes.countDocuments({ offerId });
  const now = new Date();
  const docs: VoucherCode[] = Array.from({ length: n }, (_, i) => ({
    codeId: randomUUID(),
    offerId,
    kind: 'barcode',
    value: mockBarcodeValue(existing + i + 1),
    status: 'available',
    createdAt: now,
  }));
  return appendUnits(offerId, docs);
}

/**
 * Appends link units (the real URLs the admin provided) to an offer. Input URLs
 * are de-duplicated within the batch; URLs already present on the offer are
 * skipped via the unique index.
 *
 * Input:  offerId, urls (1..VOUCHER_INVENTORY_MAX URLs).
 * Output: InventoryResult. Throws Error(status 400) when empty / over the cap.
 */
export async function addLinks(offerId: string, urls: string[]): Promise<InventoryResult> {
  if (!Array.isArray(urls) || urls.length < 1 || urls.length > VOUCHER_INVENTORY_MAX) {
    throw Object.assign(new Error(`links must contain between 1 and ${VOUCHER_INVENTORY_MAX} URLs`), { status: 400 });
  }
  const unique = Array.from(new Set(urls));
  const now = new Date();
  const docs: VoucherCode[] = unique.map((url) => ({
    codeId: randomUUID(),
    offerId,
    kind: 'link',
    value: url,
    status: 'available',
    createdAt: now,
  }));
  return appendUnits(offerId, docs);
}
