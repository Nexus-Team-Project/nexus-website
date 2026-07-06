/**
 * Bulk voucher creation from CSV rows (admin-only).
 *
 * Each row = one voucher. Validation + mapping is a pure function
 * (`validateAndMapRow`) so it is unit-testable without DB/network; the
 * orchestrator (`createVouchersBulk`) then does the side-effecting work per row
 * with bounded concurrency: best-effort image upload-from-URL (image wins, else
 * color, else tenant fallback), `createOffer`, and inventory (barcodes XOR
 * links). One bad row never aborts the batch — it is reported as failed.
 */
import { z } from 'zod';
import {
  OFFER_CATEGORIES,
  VOUCHER_VALIDITY_UNITS,
  type OfferCategory,
  type OfferVisibility,
} from '../models/domain/supply.models';
import { SKU_REGEX, SKU_MIN_LENGTH, SKU_MAX_LENGTH } from '../models/domain/supply.models';
import { VOUCHER_INVENTORY_MAX } from '../models/domain/voucher-codes.models';
import { createOffer, type CreateOfferInput } from './supply.service';
import { generateBarcodes, addLinks } from './voucher-inventory.service';
import { adoptOffer } from './catalog.service';
import { isUploadableImageUrl, uploadOfferImageFromUrl } from '../utils/cloudinary';

/** Max rows accepted per bulk request (synchronous v1 cap). */
export const BULK_MAX_ROWS = 200;

/** Bounded concurrency for per-row work (image fetch + DB writes). */
const ROW_CONCURRENCY = 5;

/** Raw CSV row: header→cell strings (as parsed client-side and posted as JSON). */
export type BulkVoucherRawRow = Record<string, string>;

/** Planned inventory for a row (mutually exclusive kinds). */
export type RowInventory =
  | { kind: 'barcode'; quantity: number }
  | { kind: 'link'; links: string[] }
  | null;

/** Result of mapping one row: either a ready create plan or a per-row error. */
export type MappedRow =
  | { ok: true; input: CreateOfferInput; rawImageUrl?: string; inventory: RowInventory }
  | { ok: false; error: string };

/** Per-row outcome returned to the client. */
export interface BulkRowResult {
  index: number;
  status: 'created' | 'failed';
  offerId?: string;
  error?: string;
}

/** Treat an empty/whitespace cell as "absent" so optional coercions don't choke. */
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Per-row schema: shape + coercion + cross-field rules. Content errors surface
 * per row (the caller catches them) so a single bad row never aborts the batch.
 */
const rowSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    face_value: z.coerce.number().positive(),
    nexus_cost: z.coerce.number().positive(),
    combinable: z.string().trim().min(1),
    category: z.preprocess(blank, z.string().optional()),
    description: z.preprocess(blank, z.string().max(10000).optional()),
    market_price: z.preprocess(blank, z.coerce.number().positive().optional()),
    validityValue: z.preprocess(blank, z.coerce.number().int().positive().optional()),
    validityUnit: z.preprocess(blank, z.enum(VOUCHER_VALIDITY_UNITS).optional()),
    sku: z.preprocess(blank, z.string().min(SKU_MIN_LENGTH).max(SKU_MAX_LENGTH).regex(SKU_REGEX).optional()),
    tags: z.preprocess(blank, z.string().optional()),
    visibility: z.preprocess(blank, z.enum(['tenant_only', 'ecosystem']).optional()),
    backgroundColor: z.preprocess(blank, z.string().regex(HEX).optional()),
    imageUrl: z.preprocess(blank, z.string().optional()),
    // Inventory cells stay raw strings: empty/invalid is tolerated (→ no
    // inventory / out of stock), so they must not fail row parsing. The only
    // hard inventory rule is barcodes-XOR-links, checked in the mapper.
    barcodeQuantity: z.preprocess(blank, z.string().optional()),
    links: z.preprocess(blank, z.string().optional()),
  })
  .refine((d) => d.nexus_cost < d.face_value, { message: 'nexus_cost must be less than face_value', path: ['nexus_cost'] })
  .refine((d) => (d.validityValue === undefined) === (d.validityUnit === undefined), {
    message: 'validityValue and validityUnit must be set together',
    path: ['validityValue'],
  });

/** Parses a barcode-quantity cell; returns the count or null when empty/invalid. */
function resolveBarcodeQuantity(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && n <= VOUCHER_INVENTORY_MAX ? n : null;
}

/**
 * Parses a links cell into valid units. All-or-nothing: returns [] when empty
 * OR when any entry is not an http(s) URL (treated as "no inventory" rather than
 * failing the row). Deduped and capped.
 */
function resolveLinks(raw: string): string[] {
  const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0 || parts.some((p) => !isUploadableImageUrl(p))) return [];
  return Array.from(new Set(parts)).slice(0, VOUCHER_INVENTORY_MAX);
}

/** Parses the combinable cell into a boolean; null when unrecognized. */
function parseCombinable(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (['yes', 'true', '1', 'y'].includes(v)) return true;
  if (['no', 'false', '0', 'n'].includes(v)) return false;
  return null;
}

/**
 * Pure validate + map of one raw CSV row into a CreateOfferInput plan.
 * Resolves visibility (default tenant_only; ecosystem requires permission or
 * completed business setup), combinable (required), inventory (barcodes XOR
 * links), and field validation. Does NOT touch DB or network.
 *
 * Input:  rawRow, ctx (tenantId/identityId + ecosystem-eligibility flags).
 * Output: { ok, input, rawImageUrl, inventory } or { ok:false, error }.
 */
export function validateAndMapRow(
  rawRow: BulkVoucherRawRow,
  ctx: { tenantId: string; identityId: string; isPlatformAdmin: boolean; businessSetupComplete: boolean },
): MappedRow {
  const parsed = rowSchema.safeParse(rawRow);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first ? `${first.path.join('.') || 'row'}: ${first.message}` : 'invalid row' };
  }
  const d = parsed.data;

  const stackable = parseCombinable(d.combinable);
  if (stackable === null) return { ok: false, error: 'combinable must be yes or no' };

  if (d.category !== undefined && !OFFER_CATEGORIES.includes(d.category as OfferCategory)) {
    return { ok: false, error: `invalid category: ${d.category}` };
  }
  const category = (d.category ?? 'other') as OfferCategory;

  const visibility: OfferVisibility = d.visibility ?? 'tenant_only';
  if (visibility === 'ecosystem' && !ctx.isPlatformAdmin && !ctx.businessSetupComplete) {
    return { ok: false, error: 'ecosystem requires completed business setup' };
  }

  // Inventory: barcodes XOR links. Both cells non-empty is the only hard error;
  // an empty/invalid cell is tolerated → no inventory (the voucher is created
  // out of stock), mirroring the lenient image fallback.
  const barcodeRaw = (d.barcodeQuantity ?? '').trim();
  const linksRaw = (d.links ?? '').trim();
  if (barcodeRaw !== '' && linksRaw !== '') {
    return { ok: false, error: 'use barcodeQuantity OR links, not both' };
  }
  let inventory: RowInventory = null;
  if (barcodeRaw !== '') {
    const q = resolveBarcodeQuantity(barcodeRaw);
    if (q !== null) inventory = { kind: 'barcode', quantity: q };
  } else if (linksRaw !== '') {
    const links = resolveLinks(linksRaw);
    if (links.length > 0) inventory = { kind: 'link', links };
  }

  const tags = (d.tags ?? '').split(';').map((s) => s.trim()).filter(Boolean).slice(0, 10);

  const input: CreateOfferInput = {
    title: d.title,
    description: d.description ?? '',
    category,
    visibility,
    executionType: 'voucher',
    market_price: d.market_price,
    face_value: d.face_value,
    nexus_cost: d.nexus_cost,
    voucherStackable: stackable,
    // Voucher validity VALUE moved to per inventory unit (voucher-validity-dating).
    // This legacy CSV bulk path is slated for removal/rework; default the offer
    // validity TYPE to 'limit' so the parent is valid. Per-unit dates are not set
    // on this path (acknowledged: revisit when the bulk/xlsx feature is re-planned).
    defaultValidityType: 'limit',
    voucherBackgroundColor: d.backgroundColor ?? null,
    sku: d.sku ?? null,
    tags,
    createdByTenantId: ctx.tenantId,
    createdByIdentityId: ctx.identityId,
  };

  return { ok: true, input, rawImageUrl: d.imageUrl, inventory };
}

/** Runs `fn` over items with a bounded worker pool, preserving result order. */
async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * Creates many vouchers from CSV rows. Per row: map/validate → best-effort image
 * upload-from-URL (image wins; failure/invalid falls back to color; none → tenant
 * fallback) → createOffer → inventory (barcodes or links). Returns per-row results.
 *
 * Input:  rows + caller context (tenant/identity + ecosystem-eligibility flags).
 * Output: { results, created, failed }.
 */
export async function createVouchersBulk(args: {
  rows: BulkVoucherRawRow[];
  tenantId: string;
  identityId: string;
  isPlatformAdmin: boolean;
  businessSetupComplete: boolean;
}): Promise<{ results: BulkRowResult[]; created: number; failed: number }> {
  const { rows, tenantId, identityId, isPlatformAdmin, businessSetupComplete } = args;

  const results = await runWithConcurrency(rows, ROW_CONCURRENCY, async (rawRow, index): Promise<BulkRowResult> => {
    const mapped = validateAndMapRow(rawRow, { tenantId, identityId, isPlatformAdmin, businessSetupComplete });
    if (!mapped.ok) return { index, status: 'failed', error: mapped.error };

    const input = { ...mapped.input };
    // Best-effort image re-host from URL. Image wins over color when it succeeds;
    // any failure/invalid URL silently leaves the color (or tenant fallback).
    if (isUploadableImageUrl(mapped.rawImageUrl)) {
      try {
        const hosted = await uploadOfferImageFromUrl(mapped.rawImageUrl);
        input.imageUrls = [hosted];
        input.voucherBackgroundColor = null;
      } catch (err) {
        console.error(`[BULK] image upload-from-URL failed (row ${index}):`, err instanceof Error ? err.message : err);
      }
    }

    try {
      const offer = await createOffer(input);
      // Auto-adopt tenant_only offers for the creating tenant so they appear in
      // the tenant's product catalog immediately — same as the manual create route.
      if (offer.visibility === 'tenant_only') {
        try {
          await adoptOffer(tenantId, offer.offerId, identityId);
        } catch (err) {
          console.error(`[BULK] auto-adopt failed (row ${index}):`, err instanceof Error ? err.message : err);
        }
      }
      // A bulk voucher is a single-variant offer (createOffer synthesizes one
      // variant from the flat fields); inventory attaches to that default variant.
      const defaultVariantId = offer.variants?.[0]?.variantId;
      if (defaultVariantId && mapped.inventory?.kind === 'barcode') {
        await generateBarcodes(offer.offerId, defaultVariantId, mapped.inventory.quantity);
      } else if (defaultVariantId && mapped.inventory?.kind === 'link') {
        // CSV links carry no paired code; map to the {url} item shape addLinks expects.
        await addLinks(offer.offerId, defaultVariantId, mapped.inventory.links.map((url) => ({ url })));
      }
      return { index, status: 'created', offerId: offer.offerId };
    } catch (err) {
      return { index, status: 'failed', error: err instanceof Error ? err.message : 'create failed' };
    }
  });

  const created = results.filter((r) => r.status === 'created').length;
  return { results, created, failed: results.length - created };
}
