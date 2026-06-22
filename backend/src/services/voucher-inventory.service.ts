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

/** Read-side summary of an offer's inventory: link values + per-kind counts. */
export interface InventorySummary {
  /** All link-unit values for the offer (used to pre-fill the edit popup). */
  links: string[];
  /** Unit counts per kind. */
  counts: { barcode: number; link: number };
}

/**
 * Returns an offer's inventory summary: every link value + per-kind counts.
 * Barcode values are intentionally not returned (mock placeholders; the edit
 * popup only needs to re-show links). Caller enforces admin + ownership.
 *
 * Input:  offerId. Output: { links, counts }.
 */
export async function getInventorySummary(offerId: string): Promise<InventorySummary> {
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const [linkDocs, barcodeCount, linkCount] = await Promise.all([
    codes.find({ offerId, kind: 'link' }, { projection: { value: 1, _id: 0 } }).toArray(),
    codes.countDocuments({ offerId, kind: 'barcode' }),
    codes.countDocuments({ offerId, kind: 'link' }),
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
 * One-kind-per-voucher guard. A voucher's inventory must be exactly one kind —
 * links (with optional codes) OR barcodes, never both. Throws 409 when the
 * offer already has units of the OTHER kind. First insert / same-kind append
 * pass. This is the authoritative server-side enforcement (the popup mirrors it
 * for UX). Called by both the manual route and the CSV path.
 */
async function assertKindMatches(offerId: string, kind: 'barcode' | 'link'): Promise<void> {
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const other = kind === 'barcode' ? 'link' : 'barcode';
  const otherCount = await codes.countDocuments({ offerId, kind: other });
  if (otherCount > 0) {
    throw Object.assign(
      new Error(`This voucher already has ${other} inventory; a voucher can hold only one kind (barcodes or links).`),
      { status: 409 },
    );
  }
}

/**
 * Appends provider-supplied barcode strings as barcode units. Mirrors addLinks:
 * de-duplicates within the batch, skips values already present via the unique
 * index, and caps at VOUCHER_INVENTORY_MAX. The backend stores the strings
 * verbatim and renders nothing — the client renders the barcode + QR.
 *
 * Input:  offerId, values (1..VOUCHER_INVENTORY_MAX non-empty strings).
 * Output: InventoryResult. Throws 400 when empty/over cap, 409 on kind mismatch.
 */
export async function addBarcodes(offerId: string, values: string[]): Promise<InventoryResult> {
  if (!Array.isArray(values) || values.length < 1 || values.length > VOUCHER_INVENTORY_MAX) {
    throw Object.assign(new Error(`barcodes must contain between 1 and ${VOUCHER_INVENTORY_MAX} values`), { status: 400 });
  }
  // Combine duplicate values into one (keep first occurrence) rather than failing.
  const unique = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
  await assertKindMatches(offerId, 'barcode');
  const now = new Date();
  const docs: VoucherCode[] = unique.map((value) => ({
    codeId: randomUUID(),
    offerId,
    kind: 'barcode',
    value,
    status: 'available',
    createdAt: now,
  }));
  return appendUnits(offerId, docs);
}

/**
 * Generates `n` mock barcode units for an offer and appends them.
 * Values continue numbering from the offer's current unit count so appended
 * units stay unique within `(offerId, value)`. Caps at VOUCHER_INVENTORY_MAX.
 * Used only by the CSV bulk path; the manual route uses addBarcodes (provider
 * strings). Kept for backward compatibility.
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

/** A link inventory item: the URL plus an optional paired code. */
export interface LinkItem {
  url: string;
  /** Optional coupon/redemption code paired with the link (charset-restricted upstream). */
  code?: string;
}

/**
 * Appends link units (the URLs the admin provided, each with an optional paired
 * `code`) to an offer. Items are de-duplicated by URL within the batch; URLs
 * already present on the offer are skipped via the unique index.
 *
 * Input:  offerId, items (1..VOUCHER_INVENTORY_MAX link items).
 * Output: InventoryResult. Throws 400 when empty/over cap, 409 on kind mismatch.
 */
export async function addLinks(offerId: string, items: LinkItem[]): Promise<InventoryResult> {
  if (!Array.isArray(items) || items.length < 1 || items.length > VOUCHER_INVENTORY_MAX) {
    throw Object.assign(new Error(`links must contain between 1 and ${VOUCHER_INVENTORY_MAX} URLs`), { status: 400 });
  }
  // Combine duplicate URLs into one (first occurrence wins, keeping its code)
  // rather than failing. Cross-batch re-adds are also tolerated by the unique index.
  await assertKindMatches(offerId, 'link');
  const byUrl = new Map<string, LinkItem>();
  for (const item of items) { if (!byUrl.has(item.url)) byUrl.set(item.url, item); }
  const now = new Date();
  const docs: VoucherCode[] = Array.from(byUrl.values()).map((item) => ({
    codeId: randomUUID(),
    offerId,
    kind: 'link',
    value: item.url,
    ...(item.code ? { code: item.code } : {}),
    status: 'available',
    createdAt: now,
  }));
  return appendUnits(offerId, docs);
}
