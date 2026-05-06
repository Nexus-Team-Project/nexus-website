/**
 * Backfills MongoDB domain identity and tenant records from legacy login/onboarding data.
 * Run dry first, then use --apply only after checking the counts.
 */
/// <reference types="node" />
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { closeMongoConnection, getMongoDb } from '../src/config/mongo';
import { getOnboardingCollections } from '../src/models/onboarding.models';
import { syncDomainIdentityForLoginUser } from '../src/services/domain-identity.service';
import { syncDomainTenantMembership } from '../src/services/domain-tenant-sync.service';

const prisma = new PrismaClient();

interface BackfillStats {
  usersSeen: number;
  identitiesSynced: number;
  tenantMembershipsSeen: number;
  tenantMembershipsSynced: number;
  tenantMembershipsSkipped: number;
}

/**
 * Checks whether this run should write data.
 * Input: command-line args.
 * Output: true only when --apply is present.
 */
function shouldApply(args: string[]): boolean {
  return args.includes('--apply');
}

/**
 * Prints script usage without connecting to databases.
 * Input: none.
 * Output: usage text is written to stdout.
 */
function printUsage(): void {
  console.log('Usage: npx tsx scripts/backfill-domain-model.ts [--apply]');
  console.log('Default mode is dry-run. Use --apply to write domain records.');
}

/**
 * Logs non-sensitive run statistics.
 * Input: dry-run/apply mode and accumulated counts.
 * Output: summary written without emails, ids, or secrets.
 */
function logStats(apply: boolean, stats: BackfillStats): void {
  console.log(apply ? 'Domain backfill applied.' : 'Domain backfill dry-run.');
  console.log(`Users seen: ${stats.usersSeen}`);
  console.log(apply ? `Identities synced: ${stats.identitiesSynced}` : `Identities to sync: ${stats.identitiesSynced}`);
  console.log(`Tenant memberships seen: ${stats.tenantMembershipsSeen}`);
  console.log(
    apply
      ? `Tenant memberships synced: ${stats.tenantMembershipsSynced}`
      : `Tenant memberships to sync: ${stats.tenantMembershipsSynced}`,
  );
  console.log(`Tenant memberships skipped: ${stats.tenantMembershipsSkipped}`);
}

/**
 * Backfills users and active tenant memberships into the domain model.
 * Input: apply flag.
 * Output: stats for verification.
 */
async function backfillDomainModel(apply: boolean): Promise<BackfillStats> {
  const stats: BackfillStats = {
    usersSeen: 0,
    identitiesSynced: 0,
    tenantMembershipsSeen: 0,
    tenantMembershipsSynced: 0,
    tenantMembershipsSkipped: 0,
  };
  const db = await getMongoDb();
  const onboarding = getOnboardingCollections(db);
  const users = await prisma.user.findMany({
    select: { id: true, email: true, fullName: true, provider: true },
  });

  for (const user of users) {
    stats.usersSeen += 1;
    const memberships = await onboarding.tenantMembers.find({ userId: user.id }).toArray();
    stats.tenantMembershipsSeen += memberships.length;

    if (!apply) continue;

    const identity = await syncDomainIdentityForLoginUser({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      provider: user.provider,
    });
    stats.identitiesSynced += 1;

    for (const membership of memberships) {
      if (!membership._id) {
        stats.tenantMembershipsSkipped += 1;
        continue;
      }

      const tenant = await onboarding.tenants.findOne({ _id: membership.tenantId });
      if (!tenant) {
        stats.tenantMembershipsSkipped += 1;
        continue;
      }

      await syncDomainTenantMembership({
        tenantId: membership.tenantId,
        tenant,
        tenantMembershipId: membership._id,
        tenantMembership: membership,
        nexusIdentityId: identity.nexusIdentityId,
      });
      stats.tenantMembershipsSynced += 1;
    }
  }

  if (!apply) {
    stats.identitiesSynced = users.length;
    stats.tenantMembershipsSynced = stats.tenantMembershipsSeen;
  }

  return stats;
}

/**
 * Runs the CLI and closes database connections.
 * Input: process arguments.
 * Output: exits non-zero when backfill fails.
 */
async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    printUsage();
    return;
  }

  const apply = shouldApply(process.argv.slice(2));
  const stats = await backfillDomainModel(apply);
  logStats(apply, stats);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown backfill failure';
    console.error(`Domain backfill failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closeMongoConnection();
  });
