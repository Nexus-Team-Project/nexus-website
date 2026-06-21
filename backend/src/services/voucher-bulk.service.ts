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
    barcodeQuantity: z.preprocess(blank, z.coerce.number().int().positive().max(VOUCHER_INVENTORY_MAX).optional()),
    links: z.preprocess(blank, z.string().optional()),
  })
  .refine((d) => d.nexus_cost < d.face_value, { message: 'nexus_cost must be less than face_value', path: ['nexus_cost'] })
  .refine((d) => !(d.barcodeQuantity !== undefined && (d.links ?? '').trim() !== ''), {
    message: 'use barcodeQuantity OR links, not both',
    path: ['links'],
  })
  .refine((d) => (d.validityValue === undefined) === (d.validityUnit === undefined), {
    message: 'validityValue and validityUnit must be set together',
    path: ['validityValue'],
  });

/** Parses the combinable cell into a boolean; null when unrecognized. */
function parseCombinable(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (['yes', 'true', '1', 'y'].includes(v)) return true;
  if (['no', 'false', '0', 'n'].includes(v)) return false;
  return null;
}

/** Splits + validates a links cell. Returns the deduped URL list or an error. */
function parseLinks(raw: string): { ok: true; links: string[] } | { ok: false; error: string } {
  const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: true, links: [] };
  if (parts.some((p) => !isUploadableImageUrl(p))) {
    return { ok: false, error: 'links must all be http(s) URLs' };
  }
  const deduped = Array.from(new Set(parts));
  if (deduped.length > VOUCHER_INVENTORY_MAX) {
    return { ok: false, error: `at most ${VOUCHER_INVENTORY_MAX} links` };
  }
  return { ok: true, links: deduped };
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

  let inventory: RowInventory = null;
  if ((d.links ?? '').trim() !== '') {
    const r = parseLinks(d.links as string);
    if (!r.ok) return { ok: false, error: r.error };
    if (r.links.length > 0) inventory = { kind: 'link', links: r.links };
  } else if (d.barcodeQuantity !== undefined) {
    inventory = { kind: 'barcode', quantity: d.barcodeQuantity };
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
    voucherValidityValue: d.validityValue ?? null,
    voucherValidityUnit: d.validityUnit ?? null,
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
      if (mapped.inventory?.kind === 'barcode') {
        await generateBarcodes(offer.offerId, mapped.inventory.quantity);
      } else if (mapped.inventory?.kind === 'link') {
        await addLinks(offer.offerId, mapped.inventory.links);
      }
      return { index, status: 'created', offerId: offer.offerId };
    } catch (err) {
      return { index, status: 'failed', error: err instanceof Error ? err.message : 'create failed' };
    }
  });

  const created = results.filter((r) => r.status === 'created').length;
  return { results, created, failed: results.length - created };
}
