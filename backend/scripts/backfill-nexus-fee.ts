/**
 * Backfill: stamp nexusFeePct (default 10) on every existing voucher offer and
 * re-bake all derived pricing (variant member_price, mirror, displayPrice,
 * adopter floors) via setNexusFeePct. Idempotent - re-running re-bakes to the
 * same values.
 *
 * Dry-run by default; pass --apply to write.
 *   npx tsx scripts/backfill-nexus-fee.ts [--apply]
 */
import 'dotenv/config';
import { closeMongoConnection, getMongoDb } from '../src/config/mongo';
import {
  getSupplyDomainCollections,
  NOT_DELETED,
  NEXUS_FEE_DEFAULT_PCT,
} from '../src/models/domain/supply.models';
import { setNexusFeePct } from '../src/services/nexus-fee.service';

const apply = process.argv.includes('--apply');

async function main(): Promise<void> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  const targets = await nexusOffers
    .find({ executionType: 'voucher', ...NOT_DELETED })
    .project<{ offerId: string; title: string; nexusFeePct?: number }>({ offerId: 1, title: 1, nexusFeePct: 1 })
    .toArray();

  console.log(`${targets.length} voucher offers; ${apply ? 'APPLYING' : 'DRY-RUN (pass --apply to write)'}`);

  for (const o of targets) {
    const pct = o.nexusFeePct ?? NEXUS_FEE_DEFAULT_PCT;
    if (!apply) {
      console.log(`  would bake "${o.title}" (${o.offerId}) at ${pct}%`);
      continue;
    }
    const res = await setNexusFeePct(o.offerId, pct);
    console.log(`  ${o.offerId}: ${res.ok ? `baked at ${pct}%` : `SKIPPED (${res.reason})`}`);
  }
  await closeMongoConnection();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
