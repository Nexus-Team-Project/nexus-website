/**
 * Backfills existing voucher offers into the unit-level dating model
 * (voucher-validity-dating): moves each variant's prior validity VALUE onto its
 * existing inventory units, sets the parent `defaultValidityType`, marks the
 * minority variants with a `validityTypeOverride`, and clears the now-obsolete
 * validity fields from the variant subdocs + the parent legacy mirror.
 *
 * Per voucher offer (executionType === 'voucher', not soft-deleted) that has NOT
 * yet been migrated (no `defaultValidityType`):
 *   1. Read each variant's PRIOR validity mode from the raw subdoc:
 *        - validFrom/validUntil present  -> 'from_until'
 *        - voucherValidityValue present  -> 'limit'
 *        - neither                       -> legacy "never expires" (REPORTED;
 *          never auto-stamped, since never-expires is no longer allowed).
 *   2. Parent `defaultValidityType` = the majority resolvable mode (ties/first;
 *      all-unresolved -> 'limit', reported). Variants whose mode differs get a
 *      `validityTypeOverride`; the rest inherit (override null).
 *   3. Stamp each variant's prior VALUE onto its existing units that lack it:
 *        - 'from_until' -> validFrom/validUntil from the variant.
 *        - 'limit'      -> validityValue/validityUnit from the variant.
 *        - never-expires units are left unstamped (reported for manual resolution).
 *   4. $set the rebuilt variants (old validity fields removed, override set) +
 *      `defaultValidityType`, and null the parent legacy voucherValidityValue/Unit.
 *
 * Members see no change: the actual window/limit each unit carried is preserved.
 *
 * SAFETY: Mongo holds all NEXUS domain data - take a `mongodump` backup BEFORE
 * running with --apply (see root CLAUDE.md "Database Backups"). Default mode is a
 * dry-run; pass --apply to write. Run on Windows with:
 *   npx tsx scripts/backfill-voucher-unit-dating.ts [--apply]
 */
/// <reference types="node" />
import 'dotenv/config';
import { closeMongoConnection, getMongoDb } from '../src/config/mongo';
import { getSupplyDomainCollections, type OfferVariant } from '../src/models/domain/supply.models';
import { getVoucherCodeCollection } from '../src/models/domain/voucher-codes.models';
import type { ValidityType } from '../src/models/domain/supply-variants.models';

/** A variant subdoc as stored BEFORE this migration (still carries old validity). */
type RawVariant = OfferVariant & {
  voucherValidityValue?: number | null;
  voucherValidityUnit?: 'days' | 'months' | 'years' | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
};

interface BackfillStats {
  voucherOffersSeen: number;
  offersNeedingMigration: number;
  offersMigrated: number;
  unitsStamped: number;
  neverExpiresVariants: number;
}

function shouldApply(args: string[]): boolean {
  return args.includes('--apply');
}

/** The variant's prior validity mode, or null for legacy never-expires. */
function priorMode(v: RawVariant): ValidityType | null {
  if (v.validFrom != null || v.validUntil != null) return 'from_until';
  if (v.voucherValidityValue != null || v.voucherValidityUnit != null) return 'limit';
  return null;
}

/** Majority resolvable mode across variants (ties -> first seen; none -> 'limit'). */
function majorityMode(modes: (ValidityType | null)[]): ValidityType {
  const counts: Record<ValidityType, number> = { limit: 0, from_until: 0 };
  for (const m of modes) if (m) counts[m] += 1;
  if (counts.limit === 0 && counts.from_until === 0) return 'limit';
  if (counts.from_until > counts.limit) return 'from_until';
  if (counts.limit > counts.from_until) return 'limit';
  // tie: first resolvable mode wins
  return (modes.find((m): m is ValidityType => m != null)) ?? 'limit';
}

/** Strips the obsolete variant-level validity fields; keeps everything else.
 *  (Type is no longer a variant field - each unit is self-typed; the offer keeps a
 *  defaultValidityType as the upload-modal default only.) Returns the cleaned
 *  variant + the variant's prior mode (used to stamp its own units). */
function rebuildVariant(v: RawVariant): { variant: OfferVariant; mode: ValidityType | null } {
  const mode = priorMode(v);
  // Destructure-to-omit: the four legacy validity fields are stripped from the variant.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { voucherValidityValue: _a, voucherValidityUnit: _b, validFrom: _c, validUntil: _d, ...rest } = v;
  return { variant: rest as OfferVariant, mode };
}

async function backfill(apply: boolean): Promise<BackfillStats> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);
  const codes = getVoucherCodeCollection(db);

  const stats: BackfillStats = {
    voucherOffersSeen: 0,
    offersNeedingMigration: 0,
    offersMigrated: 0,
    unitsStamped: 0,
    neverExpiresVariants: 0,
  };

  const cursor = nexusOffers.find({ executionType: 'voucher' });
  for await (const offer of cursor) {
    stats.voucherOffersSeen += 1;
    // Already migrated when the parent carries a defaultValidityType.
    if ((offer as { defaultValidityType?: ValidityType | null }).defaultValidityType) continue;
    const rawVariants = (offer.variants ?? []) as RawVariant[];
    if (rawVariants.length === 0) continue; // unmigrated to variants; run the variants backfill first
    stats.offersNeedingMigration += 1;

    const modes = rawVariants.map(priorMode);
    const parentDefault = majorityMode(modes); // offer-level upload default (UI hint only)
    const rebuilt = rawVariants.map((v) => rebuildVariant(v));

    for (const r of rebuilt) {
      // Stamp each variant's units with that VARIANT's own prior validity (units are
      // self-typed now; the offer default does not constrain them).
      const raw = rawVariants.find((rv) => rv.variantId === r.variant.variantId)!;
      if (r.mode == null) {
        // Legacy never-expires: report, do not stamp (manual resolution needed).
        const cnt = await codes.countDocuments({ offerId: offer.offerId, variantId: r.variant.variantId });
        if (cnt > 0) {
          stats.neverExpiresVariants += 1;
          console.warn(`[WARN] offer=${offer.offerId} variant=${r.variant.variantId} had no validity (never-expires); ${cnt} unit(s) left without a date - resolve manually.`);
        }
        continue;
      }
      const stamp = r.mode === 'from_until'
        ? { validFrom: raw.validFrom ?? null, validUntil: raw.validUntil ?? null }
        : { validityValue: raw.voucherValidityValue ?? null, validityUnit: raw.voucherValidityUnit ?? null };
      // Only stamp units that lack the relevant field (idempotent).
      const lackFilter = r.mode === 'from_until'
        ? { validUntil: { $exists: false } }
        : { validityValue: { $exists: false } };
      if (apply) {
        const res = await codes.updateMany(
          { offerId: offer.offerId, variantId: r.variant.variantId, ...lackFilter },
          { $set: stamp },
        );
        stats.unitsStamped += res.modifiedCount;
      } else {
        stats.unitsStamped += await codes.countDocuments({ offerId: offer.offerId, variantId: r.variant.variantId, ...lackFilter });
      }
    }

    if (apply) {
      await nexusOffers.updateOne(
        { offerId: offer.offerId },
        {
          $set: {
            variants: rebuilt.map((r) => r.variant),
            defaultValidityType: parentDefault,
            // Clear the legacy parent mirror (validity is per unit now).
            voucherValidityValue: null,
            voucherValidityUnit: null,
            updatedAt: new Date(),
          },
        },
      );
    }
    stats.offersMigrated += 1;
  }

  return stats;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = shouldApply(args);
  console.log(apply ? 'Voucher unit-dating backfill: APPLY mode.' : 'Voucher unit-dating backfill: DRY-RUN (use --apply to write).');
  const stats = await backfill(apply);
  console.log('--- Summary ---');
  console.log(`Voucher offers seen:          ${stats.voucherOffersSeen}`);
  console.log(`Offers needing migration:     ${stats.offersNeedingMigration}`);
  console.log(apply ? `Offers migrated:              ${stats.offersMigrated}` : `Offers to migrate:            ${stats.offersMigrated}`);
  console.log(apply ? `Units stamped with validity:  ${stats.unitsStamped}` : `Units to stamp with validity: ${stats.unitsStamped}`);
  console.log(`Never-expires variants (manual review): ${stats.neverExpiresVariants}`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeMongoConnection();
  });
