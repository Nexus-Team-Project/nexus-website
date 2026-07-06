/**
 * Backfills existing voucher offers into the parent/variant model and stamps a
 * `variantId` onto every existing `voucherCodes` unit, then swaps the
 * voucherCodes indexes to the variant-scoped set.
 *
 * For each voucher offer (executionType === 'voucher', not soft-deleted) that
 * has no `variants` array yet: create ONE default variant from the offer's
 * current flat fields (face_value, nexus_cost, member_price, validity,
 * stackable, sku, tags), set `variants: [variant]` and `redemptionScope: 'shared'`
 * (redemption terms/method stay on the parent), and stamp every existing
 * voucherCodes unit of that offer with the new variantId. Members see no change:
 * the offer keeps its current flat fields (now mirrored from the single variant).
 *
 * Index swap (apply mode, after stamping): builds the new partial indexes
 * (global-unique barcode value, per-variant-unique link value,
 * (offerId,variantId,status)) and drops the legacy ones (offer_value_unique,
 * offer_status). The global barcode-value unique index will FAIL to build if the
 * collection still holds the same barcode string under two different offers - the
 * script reports such cross-offer duplicates first and aborts the swap so they
 * can be resolved manually.
 *
 * SAFETY: Mongo holds all NEXUS domain data - take a `mongodump` backup BEFORE
 * running with --apply (see root CLAUDE.md "Database Backups"). Default mode is a
 * dry-run; pass --apply to write. Run on Windows with:
 *   npx tsx scripts/backfill-voucher-variants.ts [--apply]
 */
/// <reference types="node" />
import 'dotenv/config';
import { closeMongoConnection, getMongoDb } from '../src/config/mongo';
import {
  getSupplyDomainCollections,
  type NexusOffer,
  type OfferVariant,
} from '../src/models/domain/supply.models';
import {
  getVoucherCodeCollection,
  ensureVoucherCodeIndexes,
} from '../src/models/domain/voucher-codes.models';
import { generateVariantId } from '../src/services/supply-variants.helper';

interface BackfillStats {
  voucherOffersSeen: number;
  offersNeedingVariant: number;
  offersMigrated: number;
  unitsStamped: number;
  duplicateBarcodeValues: number;
}

/** True only when --apply is present (otherwise dry-run). */
function shouldApply(args: string[]): boolean {
  return args.includes('--apply');
}

/** Builds the single default variant from an offer's current flat fields. */
function defaultVariantFromOffer(offer: NexusOffer): OfferVariant {
  return {
    variantId: generateVariantId(),
    ...(offer.face_value !== undefined && { face_value: offer.face_value }),
    ...(offer.nexus_cost !== undefined && { nexus_cost: offer.nexus_cost }),
    ...(offer.member_price !== undefined && { member_price: offer.member_price }),
    voucherValidityValue: offer.voucherValidityValue ?? null,
    voucherValidityUnit: offer.voucherValidityUnit ?? null,
    voucherStackable: offer.voucherStackable ?? null,
    sku: offer.sku ?? null,
    tags: offer.tags ?? [],
    // redemptionScope is 'shared' for migrated offers, so terms/method stay on
    // the parent and are NOT copied onto the default variant.
  };
}

/**
 * Reports barcode `value`s that appear under more than one offer (which would
 * block the global-unique barcode index). Returns the count of colliding values.
 */
async function reportCrossOfferDuplicateBarcodes(): Promise<number> {
  const db = await getMongoDb();
  const codes = getVoucherCodeCollection(db);
  const dups = await codes
    .aggregate<{ _id: string; offers: string[] }>([
      { $match: { kind: 'barcode' } },
      { $group: { _id: '$value', offers: { $addToSet: '$offerId' } } },
      { $match: { 'offers.1': { $exists: true } } },
    ])
    .toArray();
  if (dups.length > 0) {
    console.error(`[WARN] ${dups.length} barcode value(s) exist under multiple offers; resolve before the global unique index can build:`);
    for (const d of dups.slice(0, 20)) {
      console.error(`  value="${d._id}" appears in ${d.offers.length} offers`);
    }
  }
  return dups.length;
}

/** Migrates voucher offers + stamps inventory variantIds. */
async function backfill(apply: boolean): Promise<BackfillStats> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);
  const codes = getVoucherCodeCollection(db);

  const stats: BackfillStats = {
    voucherOffersSeen: 0,
    offersNeedingVariant: 0,
    offersMigrated: 0,
    unitsStamped: 0,
    duplicateBarcodeValues: 0,
  };

  const cursor = nexusOffers.find({ executionType: 'voucher' });
  for await (const offer of cursor) {
    stats.voucherOffersSeen += 1;
    const hasVariants = Array.isArray(offer.variants) && offer.variants.length > 0;
    if (hasVariants) continue;
    stats.offersNeedingVariant += 1;

    const variant = defaultVariantFromOffer(offer);
    if (apply) {
      await nexusOffers.updateOne(
        { offerId: offer.offerId },
        { $set: { variants: [variant], redemptionScope: offer.redemptionScope ?? 'shared', updatedAt: new Date() } },
      );
      const stamp = await codes.updateMany(
        { offerId: offer.offerId, variantId: { $exists: false } },
        { $set: { variantId: variant.variantId } },
      );
      stats.unitsStamped += stamp.modifiedCount;
    } else {
      const toStamp = await codes.countDocuments({
        offerId: offer.offerId,
        variantId: { $exists: false },
      });
      stats.unitsStamped += toStamp;
    }
    stats.offersMigrated += 1;
  }

  // Index swap (only after every unit is stamped, and only when no cross-offer
  // barcode duplicate would block the global unique index).
  stats.duplicateBarcodeValues = await reportCrossOfferDuplicateBarcodes();
  if (apply) {
    if (stats.duplicateBarcodeValues > 0) {
      console.error('[ABORT] Not swapping indexes: resolve duplicate barcode values first, then re-run --apply.');
    } else {
      await ensureVoucherCodeIndexes(db);
      // Drop legacy indexes if present (idempotent - ignore "index not found").
      for (const name of ['offer_value_unique', 'offer_status']) {
        try {
          await codes.dropIndex(name);
          console.log(`Dropped legacy index ${name}`);
        } catch {
          /* index already absent - fine */
        }
      }
    }
  }

  return stats;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = shouldApply(args);
  console.log(apply ? 'Voucher variant backfill: APPLY mode.' : 'Voucher variant backfill: DRY-RUN (use --apply to write).');
  const stats = await backfill(apply);
  console.log('--- Summary ---');
  console.log(`Voucher offers seen:        ${stats.voucherOffersSeen}`);
  console.log(`Offers needing a variant:   ${stats.offersNeedingVariant}`);
  console.log(apply ? `Offers migrated:            ${stats.offersMigrated}` : `Offers to migrate:          ${stats.offersMigrated}`);
  console.log(apply ? `Inventory units stamped:    ${stats.unitsStamped}` : `Inventory units to stamp:   ${stats.unitsStamped}`);
  console.log(`Cross-offer duplicate barcodes: ${stats.duplicateBarcodeValues}`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeMongoConnection();
  });
