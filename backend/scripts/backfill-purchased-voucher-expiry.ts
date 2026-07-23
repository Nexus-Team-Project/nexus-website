/**
 * Backfill: stamp the redeemable window (validFrom/validUntil) on voucher
 * units that were PURCHASED BEFORE the purchase-time fill shipped
 * (2026-07-23). Targets units that are sold (status assigned/redeemed),
 * carry a "limit" duration recipe (validityValue/validityUnit), and have no
 * validUntil yet; the anchor date is the owning purchase's paidAt (falling
 * back to its createdAt), same as the read-side heal in listMyPurchases.
 * Stamped units are marked validityFilledAt, exactly like the live claim
 * path. Idempotent - already-stamped units no longer match the query.
 *
 * Dry-run by default; pass --apply to write.
 *   npx tsx scripts/backfill-purchased-voucher-expiry.ts [--apply]
 */
import 'dotenv/config';
import { closeMongoConnection, getMongoDb } from '../src/config/mongo';
import { DOMAIN_COLLECTIONS } from '../src/models/domain/collections';
import {
  addValidityDuration,
  getVoucherCodeCollection,
} from '../src/models/domain/voucher-codes.models';
import {
  WALLET_PURCHASES_COLLECTION,
  type WalletPurchase,
} from '../src/models/payments/wallet-payments.models';

const apply = process.argv.includes('--apply');

async function main(): Promise<void> {
  const db = await getMongoDb();
  const units = getVoucherCodeCollection(db);

  // Sold limit-recipe units with no window yet.
  const targets = await units
    .find({
      status: { $in: ['assigned', 'redeemed'] },
      validityValue: { $gt: 0 },
      validityUnit: { $in: ['days', 'months', 'years'] },
      $or: [{ validUntil: null }, { validUntil: { $exists: false } }],
    })
    .project<{
      codeId: string;
      offerId: string;
      validityValue: number;
      validityUnit: 'days' | 'months' | 'years';
      assignedPurchaseId?: string;
    }>({ codeId: 1, offerId: 1, validityValue: 1, validityUnit: 1, assignedPurchaseId: 1 })
    .toArray();

  console.log(`${targets.length} sold limit units missing a window; ${apply ? 'APPLYING' : 'DRY-RUN (pass --apply to write)'}`);
  if (targets.length === 0) {
    await closeMongoConnection();
    process.exit(0);
  }

  // Batch-load the owning purchases for the anchor dates.
  const purchaseIds = [...new Set(targets.map((u) => u.assignedPurchaseId).filter((id): id is string => Boolean(id)))];
  const purchases = await db
    .collection<WalletPurchase>(WALLET_PURCHASES_COLLECTION)
    .find({ purchaseId: { $in: purchaseIds } })
    .project<{ purchaseId: string; paidAt: Date | null; createdAt: Date }>({ purchaseId: 1, paidAt: 1, createdAt: 1 })
    .toArray();
  const purchaseMap = new Map(purchases.map((p) => [p.purchaseId, p]));

  let stamped = 0;
  let skipped = 0;
  const now = new Date();
  for (const unit of targets) {
    const purchase = unit.assignedPurchaseId ? purchaseMap.get(unit.assignedPurchaseId) : undefined;
    if (!purchase) {
      // Redeemed/legacy units may have lost their purchase link - report, never guess a date.
      console.log(`  SKIP ${unit.codeId} (offer ${unit.offerId}): no owning purchase found (assignedPurchaseId=${unit.assignedPurchaseId ?? 'unset'})`);
      skipped += 1;
      continue;
    }
    const validFrom = new Date(purchase.paidAt ?? purchase.createdAt);
    const validUntil = addValidityDuration(validFrom, unit.validityValue, unit.validityUnit);
    if (!apply) {
      console.log(`  would stamp ${unit.codeId}: ${validFrom.toISOString().slice(0, 10)} -> ${validUntil.toISOString().slice(0, 10)} (${unit.validityValue} ${unit.validityUnit})`);
      stamped += 1;
      continue;
    }
    await db.collection(DOMAIN_COLLECTIONS.voucherCodes).updateOne(
      { codeId: unit.codeId },
      { $set: { validFrom, validUntil, validityFilledAt: now, updatedAt: now } },
    );
    console.log(`  stamped ${unit.codeId}: ${validFrom.toISOString().slice(0, 10)} -> ${validUntil.toISOString().slice(0, 10)}`);
    stamped += 1;
  }

  console.log(`${apply ? 'stamped' : 'would stamp'} ${stamped} unit(s); skipped ${skipped}`);
  await closeMongoConnection();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
