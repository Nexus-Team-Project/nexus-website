/**
 * Per-variant voucher VALIDITY summaries for catalog display.
 *
 * A voucher's validity VALUE lives on each inventory unit (`voucherCodes`), not
 * on the offer or variant (see `voucher-unit-level-dating`), so the catalog
 * cannot show a variant's real validity from the offer document alone. This
 * module aggregates a variant's units into their DISTINCT validity batches so
 * read surfaces (the Benefits Partnerships variant table) can show the actual
 * validity - "12/07/26 - 31/08/30" or "5 years from purchase" - instead of a
 * type hint.
 *
 * Security: output is validity dates/durations + unit COUNTS only - never code
 * values - so it shares the exposure envelope of the counts endpoint (any
 * caller who may SEE the offer in the catalog; visibility is enforced by the
 * route, not here).
 */
import { getMongoDb } from '../config/mongo';
import { getVoucherCodeCollection } from '../models/domain/voucher-codes.models';
import type { OfferVoucherValidityUnit } from '../models/domain/supply.models';

/**
 * One distinct validity batch within a variant's inventory pool.
 * Classification mirrors the unit display rule (`formatUnitValidity` in the
 * dashboard): a unit with BOTH window dates is a window batch; otherwise a unit
 * with BOTH limit fields is a purchase-anchored limit batch. Units carrying
 * neither (legacy/unmigrated) are excluded - the UI shows a dash for them.
 */
export type VariantValidityBatch =
  | { kind: 'window'; validFrom: Date; validUntil: Date; units: number }
  | { kind: 'limit'; validityValue: number; validityUnit: OfferVoucherValidityUnit; units: number };

/** Map of variantId -> its distinct validity batches (absent = no dated units). */
export type OfferVariantValiditySummary = Record<string, VariantValidityBatch[]>;

/**
 * Caps kept far above realistic data so a pathological pool can never balloon
 * the response: an offer's distinct (variant, validity) groups are bounded in
 * the aggregation, and each variant returns at most MAX_BATCHES_PER_VARIANT
 * batches (nearest-expiring first, so a truncated tail drops only the
 * farthest-out batches).
 */
const MAX_GROUPS_PER_OFFER = 500;
const MAX_BATCHES_PER_VARIANT = 12;

/** Raw aggregation group row: the distinct validity tuple + its unit count. */
interface ValidityGroupRow {
  _id: {
    variantId: string | null;
    validFrom: Date | null;
    validUntil: Date | null;
    validityValue: number | null;
    validityUnit: OfferVoucherValidityUnit | null;
  };
  units: number;
}

/** Approximate day count for a limit recipe, used only to order mixed batches. */
const UNIT_DAYS: Record<OfferVoucherValidityUnit, number> = { days: 1, months: 30, years: 365 };

/**
 * Sort key: batches order by "how soon could this expire" so the nearest
 * window/shortest duration leads. Windows sort by their absolute end date;
 * limits by approximate duration anchored at now (a rough but stable ordering -
 * exactness does not matter for display order).
 */
function batchSortKey(b: VariantValidityBatch): number {
  return b.kind === 'window'
    ? b.validUntil.getTime()
    : Date.now() + b.validityValue * UNIT_DAYS[b.validityUnit] * 86_400_000;
}

/**
 * Maps one aggregation group to a typed batch, applying the window-first
 * classification. Returns null for unclassifiable (legacy) groups.
 */
function toBatch(row: ValidityGroupRow): VariantValidityBatch | null {
  const { validFrom, validUntil, validityValue, validityUnit } = row._id;
  if (validFrom && validUntil) {
    return { kind: 'window', validFrom, validUntil, units: row.units };
  }
  if (validityValue && validityUnit) {
    return { kind: 'limit', validityValue, validityUnit, units: row.units };
  }
  return null;
}

/**
 * Identity of a batch AFTER classification. A unit may carry dormant fields of
 * the other type (a type switch never deletes the old set), so two aggregation
 * groups can classify to the same effective batch - this key merges them.
 */
function batchKey(b: VariantValidityBatch): string {
  return b.kind === 'window'
    ? `w|${b.validFrom.toISOString()}|${b.validUntil.toISOString()}`
    : `l|${b.validityValue}|${b.validityUnit}`;
}

/**
 * Aggregates one offer's inventory units into per-variant distinct validity
 * batches (numbers + dates only - never code values).
 *
 * Input:  offerId.
 * Output: map of variantId -> batches, nearest-expiring first; a variant with
 *         no dated units is absent (the UI shows a dash).
 */
export async function getOfferVariantValiditySummaries(
  offerId: string,
): Promise<OfferVariantValiditySummary> {
  const db = await getMongoDb();
  const rows = await getVoucherCodeCollection(db)
    .aggregate<ValidityGroupRow>([
      { $match: { offerId } },
      {
        $group: {
          _id: {
            variantId: { $ifNull: ['$variantId', null] },
            validFrom: { $ifNull: ['$validFrom', null] },
            validUntil: { $ifNull: ['$validUntil', null] },
            validityValue: { $ifNull: ['$validityValue', null] },
            validityUnit: { $ifNull: ['$validityUnit', null] },
          },
          units: { $sum: 1 },
        },
      },
      { $limit: MAX_GROUPS_PER_OFFER },
    ])
    .toArray();

  // Merge classified batches per variant (dormant leftover fields can split one
  // effective batch across several aggregation groups), then order + cap.
  const merged: Record<string, Map<string, VariantValidityBatch>> = {};
  for (const row of rows) {
    const variantId = row._id.variantId;
    const batch = variantId ? toBatch(row) : null;
    if (!variantId || !batch) continue;
    const byKey = (merged[variantId] ??= new Map());
    const existing = byKey.get(batchKey(batch));
    if (existing) existing.units += batch.units;
    else byKey.set(batchKey(batch), batch);
  }
  const summary: OfferVariantValiditySummary = {};
  for (const [variantId, byKey] of Object.entries(merged)) {
    summary[variantId] = [...byKey.values()]
      .sort((a, b) => batchSortKey(a) - batchSortKey(b))
      .slice(0, MAX_BATCHES_PER_VARIANT);
  }
  return summary;
}
