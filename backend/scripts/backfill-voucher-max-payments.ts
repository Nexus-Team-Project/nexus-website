/**
 * Backfills `maxPayments` onto existing voucher offers that do not have the
 * field yet (missing or null), stamping VOUCHER_PAYMENTS_DEFAULT (1). Reads
 * already fall back to 1, so this only makes the stored documents explicit.
 *
 * Idempotent: re-running matches 0 documents. Dry-run by default; pass --apply
 * to write. Run on Windows with:
 *   npx tsx scripts/backfill-voucher-max-payments.ts [--apply]
 */
/// <reference types="node" />
import 'dotenv/config';
import { closeMongoConnection, getMongoDb } from '../src/config/mongo';
import {
  getSupplyDomainCollections,
  VOUCHER_PAYMENTS_DEFAULT,
} from '../src/models/domain/supply.models';

/** True only when --apply is present (otherwise dry-run). */
function shouldApply(args: string[]): boolean {
  return args.includes('--apply');
}

async function main(): Promise<void> {
  const apply = shouldApply(process.argv.slice(2));
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  // Vouchers (incl. soft-deleted - history stays consistent) missing the field.
  const filter = {
    executionType: 'voucher' as const,
    $or: [{ maxPayments: { $exists: false } }, { maxPayments: null }],
  };

  const count = await nexusOffers.countDocuments(filter);
  console.log(`[BACKFILL] voucher offers missing maxPayments: ${count}`);

  if (!apply) {
    console.log('[BACKFILL] dry-run only. Re-run with --apply to write.');
    return;
  }

  const result = await nexusOffers.updateMany(filter, {
    $set: { maxPayments: VOUCHER_PAYMENTS_DEFAULT, updatedAt: new Date() },
  });
  console.log(`[BACKFILL] stamped maxPayments=${VOUCHER_PAYMENTS_DEFAULT} on ${result.modifiedCount} offers.`);
}

main()
  .catch((err) => {
    console.error('[BACKFILL] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => void closeMongoConnection());
