/**
 * Backfill/repair: stamp the derived search fields (descriptionText +
 * cashbackMinPct/MaxPct) on every existing non-deleted offer. Values are
 * recomputed from the CURRENT document (description, variants, flat prices)
 * via the same pure helper the write paths use, so re-running always converges
 * to the same result (idempotent) and the script doubles as a drift-repair tool.
 *
 * Dry-run by default; pass --apply to write. Run per environment on deploy
 * (after a Mongo backup) before enabling the catalog-search module.
 *   npx tsx scripts/backfill-search-fields.ts [--apply]
 */
import 'dotenv/config';
import type { Db } from 'mongodb';
import { closeMongoConnection, getMongoDb } from '../src/config/mongo';
import {
  getSupplyDomainCollections,
  NOT_DELETED,
  type NexusOffer,
} from '../src/models/domain/supply.models';
import { getTenantDomainCollections } from '../src/models/domain';
import { offerSearchWriteFields } from '../src/services/offer-search-fields.helper';

const apply = process.argv.includes('--apply');
const BATCH_SIZE = 200;

/**
 * Mirrors tenantProfiles.businessDescription onto domainTenants (the
 * tenants_search index reads the mirror so tenant name + description live on
 * ONE collection). The live write-through is syncDomainTenantCoreDocs; this
 * pass covers tenants that predate it.
 */
async function backfillTenantDescriptionMirror(db: Db): Promise<void> {
  const { domainTenants, tenantProfiles } = getTenantDomainCollections(db);
  const profiles = await tenantProfiles
    .find(
      { businessDescription: { $exists: true, $nin: [null, ''] } },
      { projection: { tenantId: 1, businessDescription: 1 } },
    )
    .toArray();

  let changed = 0;
  for (const profile of profiles) {
    const tenant = await domainTenants.findOne(
      { tenantId: profile.tenantId },
      { projection: { businessDescription: 1 } },
    );
    if (!tenant || tenant.businessDescription === profile.businessDescription) continue;
    changed += 1;
    if (!apply) {
      console.log(`  would mirror businessDescription for tenant ${profile.tenantId}`);
      continue;
    }
    await domainTenants.updateOne(
      { tenantId: profile.tenantId },
      { $set: { businessDescription: profile.businessDescription, updatedAt: new Date() } },
    );
  }
  console.log(
    `${profiles.length} tenant profiles scanned; ${changed} mirrors ${apply ? 'updated' : 'need updating'}`,
  );
}

async function main(): Promise<void> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  const cursor = nexusOffers
    .find({ ...NOT_DELETED })
    .project<Pick<NexusOffer,
      'offerId' | 'title' | 'description' | 'descriptionText' | 'variants'
      | 'face_value' | 'member_price' | 'cashbackMinPct' | 'cashbackMaxPct'
    >>({
      offerId: 1, title: 1, description: 1, descriptionText: 1, variants: 1,
      face_value: 1, member_price: 1, cashbackMinPct: 1, cashbackMaxPct: 1,
    });

  let scanned = 0;
  let changed = 0;
  let ops: { updateOne: { filter: { offerId: string }; update: { $set: Record<string, unknown> } } }[] = [];

  for await (const offer of cursor) {
    scanned += 1;
    const fields = offerSearchWriteFields({
      description: offer.description ?? '',
      variants: offer.variants,
      flatFaceValue: offer.face_value,
      flatMemberPrice: offer.member_price,
    });
    const upToDate =
      offer.descriptionText === fields.descriptionText
      && offer.cashbackMinPct === fields.cashbackMinPct
      && offer.cashbackMaxPct === fields.cashbackMaxPct;
    if (upToDate) continue;

    changed += 1;
    if (!apply) {
      console.log(
        `  would stamp "${offer.title}" (${offer.offerId}): `
        + `cashback ${fields.cashbackMinPct ?? '-'}..${fields.cashbackMaxPct ?? '-'}%, `
        + `descriptionText ${fields.descriptionText?.length ?? 0} chars`,
      );
      continue;
    }
    ops.push({ updateOne: { filter: { offerId: offer.offerId }, update: { $set: { ...fields } } } });
    if (ops.length >= BATCH_SIZE) {
      await nexusOffers.bulkWrite(ops);
      ops = [];
    }
  }
  if (apply && ops.length > 0) await nexusOffers.bulkWrite(ops);

  console.log(
    `${scanned} offers scanned; ${changed} ${apply ? 'updated' : 'need updating'} `
    + `(${apply ? 'APPLIED' : 'DRY-RUN - pass --apply to write'})`,
  );
  await backfillTenantDescriptionMirror(db);
  await closeMongoConnection();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
