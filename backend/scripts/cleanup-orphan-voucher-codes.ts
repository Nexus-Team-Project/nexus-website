/**
 * One-off cleanup: delete voucherCodes whose parent offer is soft-deleted or gone.
 *
 * Barcodes are GLOBALLY unique (partial unique index on voucherCodes.value for
 * kind:'barcode'). Before the deleteOffer cascade fix, deleting an offer left its
 * voucherCodes behind, so their barcode values stayed reserved and could never be
 * reused. This removes those orphans.
 *
 * Dry-run by default (prints what WOULD be deleted). Pass --apply to delete.
 *   npx tsx scripts/cleanup-orphan-voucher-codes.ts            # dry run
 *   npx tsx scripts/cleanup-orphan-voucher-codes.ts --apply    # delete
 */
import 'dotenv/config';
import { getMongoDb } from '../src/config/mongo';
import { getSupplyDomainCollections, NOT_DELETED } from '../src/models/domain/supply.models';
import { getVoucherCodeCollection } from '../src/models/domain/voucher-codes.models';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);
  const codes = getVoucherCodeCollection(db);

  // Live offers = not soft-deleted (NOT_DELETED matches deletedAt null OR missing).
  const liveOfferIds = await nexusOffers.distinct('offerId', { ...NOT_DELETED });
  const orphanFilter = { offerId: { $nin: liveOfferIds } };

  const orphanTotal = await codes.countDocuments(orphanFilter);
  const orphanBarcodes = await codes.countDocuments({ ...orphanFilter, kind: 'barcode' });
  const distinctOrphanOffers = await codes.distinct('offerId', orphanFilter);
  const sampleBarcodes = await codes
    .find({ ...orphanFilter, kind: 'barcode' }, { projection: { value: 1, offerId: 1, _id: 0 } })
    .limit(20)
    .toArray();

  console.log(`Live (non-deleted) offers: ${liveOfferIds.length}`);
  console.log(`Orphan voucherCodes: ${orphanTotal} (barcodes: ${orphanBarcodes}) across ${distinctOrphanOffers.length} deleted/missing offers`);
  console.log('Sample orphan barcodes:', sampleBarcodes.map((c) => c.value).join(', ') || '(none)');

  if (!apply) {
    console.log('\nDRY RUN - nothing deleted. Re-run with --apply to delete these orphans.');
    process.exit(0);
  }

  const res = await codes.deleteMany(orphanFilter);
  console.log(`\nAPPLIED - deleted ${res.deletedCount} orphan voucherCodes.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
