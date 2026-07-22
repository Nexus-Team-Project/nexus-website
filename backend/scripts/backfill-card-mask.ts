/**
 * Backfill: reduce saved card masks stored BEFORE the 2026-07-21 last-4-only
 * change (first6+last4, e.g. "532610******5846") down to "****<last4>", so the
 * BIN no longer persists. Idempotent - masks already in "****XXXX" form are
 * skipped; only rows whose mask carries more than the last 4 are rewritten.
 *
 * Dry-run by default; pass --apply to write.
 *   npx tsx scripts/backfill-card-mask.ts [--apply]
 */
import 'dotenv/config';
import { closeMongoConnection, getMongoDb } from '../src/config/mongo';
import { WALLET_PAYMENT_CARDS_COLLECTION } from '../src/models/payments/wallet-payments.models';

const apply = process.argv.includes('--apply');

async function main(): Promise<void> {
  const db = await getMongoDb();
  const col = db.collection<{ cardId: string; cardMask: string }>(WALLET_PAYMENT_CARDS_COLLECTION);
  // Rows whose mask is NOT already the last-4-only form.
  const rows = await col.find({ cardMask: { $not: /^\*{4}\d{4}$/ } }).toArray();
  console.log(`${rows.length} card(s) with a non-last-4 mask${apply ? '' : ' (dry-run)'}`);

  for (const row of rows) {
    const next = `****${row.cardMask.replace(/\D/g, '').slice(-4)}`;
    console.log(`  ${row.cardMask} -> ${next}`);
    if (apply) await col.updateOne({ cardId: row.cardId }, { $set: { cardMask: next } });
  }

  console.log(apply ? 'Done.' : 'Dry-run complete. Re-run with --apply to write.');
  await closeMongoConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
