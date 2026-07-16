/**
 * Retroactive backfill: adopts every existing ADMIN offer (uploadedByIdentityId
 * set, visibility 'ecosystem', status 'active', not deleted) into every
 * eligible tenant's catalog (active benefits_catalog activation AND
 * Tenant.autoAdoptAdminOffers !== false). Existing TenantOfferConfig rows of
 * any status (including 'excluded') are never touched, so re-running adopts
 * nothing new (idempotent).
 *
 * Dry-run by default (prints per-tenant would-adopt counts); pass --apply to
 * write. Run on Windows with:
 *   npx tsx scripts/backfill-admin-offer-adoption.ts [--apply]
 */
/// <reference types="node" />
import 'dotenv/config';
import { closeMongoConnection, getMongoDb } from '../src/config/mongo';
import { getTenantDomainCollections } from '../src/models/domain';
import { autoAdoptAdminOffersForTenant } from '../src/services/admin-offer-auto-adopt.service';

/** True only when --apply is present (otherwise dry-run). */
function shouldApply(args: string[]): boolean {
  return args.includes('--apply');
}

async function main(): Promise<void> {
  const apply = shouldApply(process.argv.slice(2));
  const db = await getMongoDb();

  // Iterate active-catalog tenants; autoAdoptAdminOffersForTenant re-checks
  // full eligibility itself (activation + the opt-out flag), so this list is
  // just the candidate set.
  const activations = await getTenantDomainCollections(db).tenantServiceActivations
    .find({ serviceKey: 'benefits_catalog', status: 'active' }, { projection: { tenantId: 1 } })
    .toArray();

  let total = 0;
  for (const { tenantId } of activations) {
    const { adoptedCount } = await autoAdoptAdminOffersForTenant(tenantId, { dryRun: !apply });
    if (adoptedCount > 0) {
      console.log(`[BACKFILL] ${apply ? 'adopted' : 'would adopt'} ${adoptedCount} offer(s) for tenant ${tenantId}`);
    }
    total += adoptedCount;
  }
  console.log(
    `[BACKFILL] ${apply ? 'DONE' : 'DRY RUN'}: ${total} adoption(s) across ${activations.length} active-catalog tenant(s).`,
  );
  if (!apply) console.log('[BACKFILL] dry-run only. Re-run with --apply to write.');
}

main()
  .catch((err) => {
    console.error('[BACKFILL] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => void closeMongoConnection());
