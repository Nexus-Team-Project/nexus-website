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

/**
 * Per-batch validity stamped onto every unit created in one inventory request
 * (voucher-validity-dating). The shape carries whichever set matches the variant's
 * effective type: `limit` -> validityValue + validityUnit (the window is filled at
 * purchase); `from_until` -> validFrom + validUntil. The route validates that the
 * supplied set matches the variant's effective type before calling the service.
 */
export interface BatchValidity {
  validityValue?: number | null;
  validityUnit?: 'days' | 'months' | 'years' | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
}

/**
 * Builds the validity fields to stamp on a unit doc from a batch validity, keeping
 * only the present values (so a `limit` batch leaves validFrom/validUntil unset and
 * a `from_until` batch leaves the duration unset). Pure.
 */
function validityFields(validity?: BatchValidity): Partial<VoucherCode> {
  if (!validity) return {};
  const out: Partial<VoucherCode> = {};
  if (validity.validityValue != null) out.validityValue = validity.validityValue;
  if (validity.validityUnit != null) out.validityUnit = validity.validityUnit;
  if (validity.validFrom != null) out.validFrom = validity.validFrom;
  if (validity.validUntil != null) out.validUntil = validity.validUntil;
  return out;
}

/** Result of an inventory operation. */
export interface InventoryResult {
  /** Units actually created by this call (duplicates skipped). */
  created: number;
  /** The variant's total unit count after this call. */
  variantCount: number;
  /** The offer's total unit count after this call (its new stockLimit = sum of variants). */
  stockLimit: number;
}

/** Read-side summary of a VARIANT's inventory: code values + per-kind counts. */
export interface InventorySummary {
  /** All barcode-unit values for the variant (used to pre-fill the edit popup). */
  barcodes: string[];
  /** All link-unit values for the variant (used to pre-fill the edit popup). */
  links: string[];
  /** Unit counts per kind for the variant. */
  counts: { barcode: number; link: number };
}

/**
 * Returns a variant's inventory summary: every barcode + link value + per-kind
 * counts, so the Edit popup can re-show the existing inventory (codes and
 * quantity) instead of resetting it. Caller enforces admin + ownership +
 * voucher-only; the values are the tenant's own provider strings (not secrets).
 *
 * Input:  offerId, variantId. Output: { barcodes, links, counts }.
 */
export async function getInventorySummary(
  offerId: string,
  variantId: string,
): Promise<InventorySummary> {
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const [barcodeDocs, linkDocs] = await Promise.all([
    codes.find({ offerId, variantId, kind: 'barcode' }, { projection: { value: 1, _id: 0 } }).toArray(),
    codes.find({ offerId, variantId, kind: 'link' }, { projection: { value: 1, _id: 0 } }).toArray(),
  ]);
  return {
    barcodes: barcodeDocs.map((d) => d.value),
    links: linkDocs.map((d) => d.value),
    counts: { barcode: barcodeDocs.length, link: linkDocs.length },
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
  validity?: BatchValidity,
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
  const validityStamp = validityFields(validity);
  const docs: VoucherCode[] = toInsert.map((value) => ({
    codeId: randomUUID(),
    offerId,
    variantId,
    kind: 'barcode',
    value,
    status: 'available',
    ...validityStamp,
    createdAt: now,
    updatedAt: now,
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
    updatedAt: now,
  }));
  return appendUnits(offerId, variantId, docs);
}

/** A link inventory item: the URL plus an optional paired code. */
export interface LinkItem {
  url: string;
  /** Optional coupon/redemption code paired with the link (charset-restricted upstream). */
  code?: string;
}

/** A stored link unit reduced to the fields needed for conflict detection. */
interface ExistingLinkCode {
  /** The stored link URL (VoucherCode.value for a link unit). */
  value: string;
  /** The paired code, if any. */
  code?: string;
}

/**
 * Pure helper: maps each non-empty trimmed code to the set of distinct URLs that
 * use it, across both the incoming items and any already-stored link units, and
 * returns the codes paired with two or more distinct URLs. A code reused across
 * DIFFERENT links is a conflict; the same code on the same URL (idempotent
 * re-add) is not. Matching is exact after trim. Exported for unit testing.
 *
 * Input:  incoming link items, existing stored link units ({value,code}).
 * Output: sorted array of conflicting codes (empty when none).
 */
export function findConflictingCodes(
  items: LinkItem[],
  existing: ExistingLinkCode[],
): string[] {
  const urlsByCode = new Map<string, Set<string>>();
  const add = (rawCode: string | undefined, rawUrl: string): void => {
    const code = (rawCode ?? '').trim();
    if (!code) return;
    const url = rawUrl.trim();
    let urls = urlsByCode.get(code);
    if (!urls) { urls = new Set<string>(); urlsByCode.set(code, urls); }
    urls.add(url);
  };
  for (const item of items) add(item.code, item.url);
  for (const e of existing) add(e.code, e.value);
  const conflicts: string[] = [];
  for (const [code, urls] of urlsByCode) {
    if (urls.size > 1) conflicts.push(code);
  }
  return conflicts.sort();
}

/**
 * Authoritative server-side guard: a non-empty code may not be paired with more
 * than one distinct link. Checks the incoming batch AND existing link units on
 * the same variant (so adding a link on Edit cannot reuse a code already taken
 * by a different stored link). Throws 409 listing the offending codes.
 *
 * Input:  offerId, variantId, the (URL-deduped) incoming link items.
 * Output: void. Throws createError(409) when any code spans multiple links.
 */
async function assertNoLinkCodeConflicts(
  offerId: string,
  variantId: string,
  items: LinkItem[],
): Promise<void> {
  const incomingCodes = Array.from(
    new Set(items.map((i) => i.code?.trim()).filter((c): c is string => !!c)),
  );
  let existing: ExistingLinkCode[] = [];
  if (incomingCodes.length > 0) {
    const db = await getMongoDb();
    const codes = getVoucherCodeCollection(db);
    existing = await codes
      .find(
        { offerId, variantId, kind: 'link', code: { $in: incomingCodes } },
        { projection: { value: 1, code: 1, _id: 0 } },
      )
      .toArray();
  }
  const conflicts = findConflictingCodes(items, existing);
  if (conflicts.length > 0) {
    throw createError(
      `These codes are each used by more than one link and must be unique: ${conflicts.join(', ')}`,
      409,
    );
  }
}

/**
 * Appends link units (each with an optional paired `code`) to a variant. Items
 * are de-duplicated by URL within the batch; URLs already present on the variant
 * are skipped via the unique index.
 *
 * A non-empty `code` may not be shared across different links (checked within the
 * batch and against existing variant links) - that is a 409 conflict, not a skip.
 *
 * Input:  offerId, variantId, items (1..VOUCHER_INVENTORY_MAX link items).
 * Output: InventoryResult. Throws 400 when empty/over cap, 409 on kind mismatch
 *         or a code reused across multiple links.
 */
export async function addLinks(
  offerId: string,
  variantId: string,
  items: LinkItem[],
  validity?: BatchValidity,
): Promise<InventoryResult> {
  if (!Array.isArray(items) || items.length < 1 || items.length > VOUCHER_INVENTORY_MAX) {
    throw createError(`links must contain between 1 and ${VOUCHER_INVENTORY_MAX} URLs`, 400);
  }
  await assertKindMatches(offerId, variantId, 'link');
  const byUrl = new Map<string, LinkItem>();
  for (const item of items) { if (!byUrl.has(item.url)) byUrl.set(item.url, item); }
  const deduped = Array.from(byUrl.values());
  // A non-empty code may not be shared across different links (within this batch
  // or against links already on the variant). Reject before inserting anything.
  await assertNoLinkCodeConflicts(offerId, variantId, deduped);
  const now = new Date();
  const validityStamp = validityFields(validity);
  const docs: VoucherCode[] = deduped.map((item) => ({
    codeId: randomUUID(),
    offerId,
    variantId,
    kind: 'link',
    value: item.url,
    ...(item.code ? { code: item.code } : {}),
    status: 'available',
    ...validityStamp,
    createdAt: now,
    updatedAt: now,
  }));
  return appendUnits(offerId, variantId, docs);
}

/** One inventory unit as exposed to the management surface. Dates are ISO strings. */
export interface InventoryUnitView {
  codeId: string;
  kind: 'barcode' | 'link';
  value: string;
  code?: string;
  status: 'available' | 'assigned' | 'redeemed';
  validityValue?: number | null;
  validityUnit?: 'days' | 'months' | 'years' | null;
  validFrom?: string | null;
  validUntil?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** Expiring-soon choices for the management filter (fixed, not a free day count). */
export type ExpiringWindow = '1m' | '3m' | '1y';

/** Date filter for listing a variant's units. All optional and combined with AND. */
export interface UnitDateFilter {
  /** Units whose window starts on or after this date (validFrom >= from). */
  from?: Date;
  /** Units whose window ends on or before this date (validUntil <= until). */
  until?: Date;
  /** Units expiring within a fixed window from now (validUntil <= now + window). */
  expiringWithin?: ExpiringWindow;
  /** Only units with no window yet (unsold limit units: validFrom + validUntil null). */
  noWindow?: boolean;
}

/** A page of a variant's inventory units plus the total matching the filter. */
export interface InventoryUnitPage {
  units: InventoryUnitView[];
  total: number;
  page: number;
  pageSize: number;
}

const UNIT_PAGE_SIZE_DEFAULT = 50;
const UNIT_PAGE_SIZE_MAX = 200;

/** Adds a fixed expiring-soon window to `now`, returning the cutoff date. */
function expiringCutoff(now: Date, window: ExpiringWindow): Date {
  const d = new Date(now);
  if (window === '1m') d.setMonth(d.getMonth() + 1);
  else if (window === '3m') d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

/** Maps a stored unit doc to the management view shape (dates -> ISO strings). */
function toUnitView(d: VoucherCode): InventoryUnitView {
  return {
    codeId: d.codeId,
    kind: d.kind,
    value: d.value,
    ...(d.code ? { code: d.code } : {}),
    status: d.status,
    validityValue: d.validityValue ?? null,
    validityUnit: d.validityUnit ?? null,
    validFrom: d.validFrom ? new Date(d.validFrom).toISOString() : null,
    validUntil: d.validUntil ? new Date(d.validUntil).toISOString() : null,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
  };
}

/**
 * Lists a variant's inventory units (paged + date-filtered) for the management
 * surface. Filtering is resolved server-side so it scales with paging. Caller
 * enforces admin + ownership + voucher-only.
 *
 * Input:  offerId, variantId, filter (date range / expiring-soon / no-window),
 *         page (1-based), pageSize (clamped), and `now` for the expiring cutoff.
 * Output: InventoryUnitPage. Newest units first.
 */
export async function listVariantUnits(
  offerId: string,
  variantId: string,
  filter: UnitDateFilter = {},
  page = 1,
  pageSize = UNIT_PAGE_SIZE_DEFAULT,
  now: Date = new Date(),
): Promise<InventoryUnitPage> {
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const query: Record<string, unknown> = { offerId, variantId };
  if (filter.noWindow) {
    query.validFrom = null;
    query.validUntil = null;
  } else {
    const validUntil: Record<string, Date> = {};
    const validFrom: Record<string, Date> = {};
    if (filter.from) validFrom.$gte = filter.from;
    if (filter.until) validUntil.$lte = filter.until;
    if (filter.expiringWithin) {
      validUntil.$lte = expiringCutoff(now, filter.expiringWithin);
      // expiring filter implies a set window
      query.validUntil = { ...validUntil, $ne: null };
    } else if (Object.keys(validUntil).length > 0) {
      query.validUntil = validUntil;
    }
    if (Object.keys(validFrom).length > 0) query.validFrom = validFrom;
  }
  const size = Math.min(Math.max(1, Math.floor(pageSize)), UNIT_PAGE_SIZE_MAX);
  const current = Math.max(1, Math.floor(page));
  const [docs, total] = await Promise.all([
    codes.find(query).sort({ createdAt: -1 }).skip((current - 1) * size).limit(size).toArray(),
    codes.countDocuments(query),
  ]);
  return { units: docs.map(toUnitView), total, page: current, pageSize: size };
}

/**
 * Updates ONE unit's validity fields (only). Sets the supplied validity keys via
 * $set, leaving the unit's `value`/`kind`/`status` untouched and preserving any
 * validity set not included (lossless flip). Caller enforces admin + ownership +
 * voucher-only and validates the validity against the unit's effective type.
 *
 * Input:  offerId, variantId, codeId, validity (the fields to set).
 * Output: the updated InventoryUnitView, or null when no such unit exists.
 */
export async function updateUnitValidity(
  offerId: string,
  variantId: string,
  codeId: string,
  validity: BatchValidity,
): Promise<InventoryUnitView | null> {
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const $set: Partial<VoucherCode> = {};
  if (validity.validityValue !== undefined) $set.validityValue = validity.validityValue;
  if (validity.validityUnit !== undefined) $set.validityUnit = validity.validityUnit;
  if (validity.validFrom !== undefined) $set.validFrom = validity.validFrom;
  if (validity.validUntil !== undefined) $set.validUntil = validity.validUntil;
  if (Object.keys($set).length === 0) {
    const doc = await codes.findOne({ offerId, variantId, codeId });
    return doc ? toUnitView(doc) : null;
  }
  $set.updatedAt = new Date();
  const updated = await codes.findOneAndUpdate(
    { offerId, variantId, codeId },
    { $set },
    { returnDocument: 'after' },
  );
  return updated ? toUnitView(updated) : null;
}

/**
 * Updates the validity of MANY units in ONE request (the bulk re-stamp path).
 * Sets only the supplied validity keys via a single `updateMany`, leaving each
 * unit's value/kind/status and any non-supplied validity set untouched (lossless
 * flip). Scoped to the offer+variant so only that variant's units are touched.
 * Caller enforces admin + ownership + voucher-only and validates the validity
 * against the variant's effective type.
 *
 * Input:  offerId, variantId, codeIds (1..VOUCHER_INVENTORY_MAX), validity.
 * Output: { updated } - the number of units modified.
 */
/** One unit's validity before and after a bulk update (for the audit/response). */
export interface UnitValidityChange {
  codeId: string;
  value: string;
  before: BatchValidity;
  after: BatchValidity;
}

export interface BulkUpdateResult {
  updated: number;
  /** Per-unit before -> after validity for the units that were changed. */
  changes: UnitValidityChange[];
}

/** Reduces a stored unit to its validity fields (for before/after reporting). */
function unitValidity(u: Pick<VoucherCode, 'validityValue' | 'validityUnit' | 'validFrom' | 'validUntil'>): BatchValidity {
  return {
    validityValue: u.validityValue ?? null,
    validityUnit: u.validityUnit ?? null,
    validFrom: u.validFrom ?? null,
    validUntil: u.validUntil ?? null,
  };
}

export async function updateUnitsValidity(
  offerId: string,
  variantId: string,
  codeIds: string[],
  validity: BatchValidity,
): Promise<BulkUpdateResult> {
  if (codeIds.length === 0) return { updated: 0, changes: [] };
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const $set: Partial<VoucherCode> = {};
  if (validity.validityValue !== undefined) $set.validityValue = validity.validityValue;
  if (validity.validityUnit !== undefined) $set.validityUnit = validity.validityUnit;
  if (validity.validFrom !== undefined) $set.validFrom = validity.validFrom;
  if (validity.validUntil !== undefined) $set.validUntil = validity.validUntil;
  if (Object.keys($set).length === 0) return { updated: 0, changes: [] };
  $set.updatedAt = new Date();
  // Snapshot the targeted units BEFORE the write so we can report from -> to.
  const targets = await codes
    .find({ offerId, variantId, codeId: { $in: codeIds } }, { projection: { codeId: 1, value: 1, validityValue: 1, validityUnit: 1, validFrom: 1, validUntil: 1, _id: 0 } })
    .toArray();
  const res = await codes.updateMany({ offerId, variantId, codeId: { $in: codeIds } }, { $set });
  const changes: UnitValidityChange[] = targets.map((u) => ({
    codeId: u.codeId,
    value: u.value,
    before: unitValidity(u),
    after: { ...unitValidity(u), ...validity }, // $set only changed the supplied keys
  }));
  return { updated: res.modifiedCount, changes };
}

/**
 * Deletes ONE inventory unit and re-syncs the offer's derived stock. Caller
 * enforces admin + ownership + voucher-only.
 *
 * Input:  offerId, variantId, codeId.
 * Output: { deleted, stockLimit } - deleted=false when no such unit existed.
 */
export async function deleteUnit(
  offerId: string,
  variantId: string,
  codeId: string,
): Promise<{ deleted: boolean; stockLimit: number }> {
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const res = await codes.deleteOne({ offerId, variantId, codeId });
  const stockLimit = await syncStockFromInventory(offerId);
  return { deleted: res.deletedCount === 1, stockLimit };
}
