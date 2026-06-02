/**
 * Wallet default-tenant preference. Lets a returning member choose which
 * context they land on at login: a specific tenant they belong to, or the
 * Nexus (ecosystem) catalog. Stored on NexusIdentity.walletDefaultTenantId
 * (the 'ecosystem' sentinel or a tenantId); the effective default (with the
 * last-joined fallback) is computed in computeWalletMeRouter and surfaced as
 * /api/me defaultTenantId.
 */
import type { Db } from 'mongodb';
import { getIdentityDomainCollections } from '../../models/domain';

/**
 * Set a member's default landing context.
 *
 * @param db Mongo handle
 * @param args.nexusIdentityId caller's identity, derived server-side from the
 *        authenticated session - never trusted from the client.
 * @param args.tenantId a tenantId the caller belongs to, or null for the
 *        Nexus (ecosystem) catalog.
 * @throws Error('not_a_member') when a tenantId is given but the caller holds
 *        no role in that tenant.
 */
export async function setWalletDefaultTenant(
  db: Db,
  args: { nexusIdentityId: string; tenantId: string | null },
): Promise<void> {
  const { nexusIdentities, tenantUserRoles } = getIdentityDomainCollections(db);

  if (args.tenantId !== null) {
    // Server-side guard: a member can only default to a tenant they actually
    // belong to. The frontend list is UX only and must be re-checked here.
    const role = await tenantUserRoles.findOne({
      nexusIdentityId: args.nexusIdentityId,
      tenantId: args.tenantId,
    });
    if (!role) throw new Error('not_a_member');
  }

  await nexusIdentities.updateOne(
    { nexusIdentityId: args.nexusIdentityId },
    { $set: { walletDefaultTenantId: args.tenantId ?? 'ecosystem', updatedAt: new Date() } },
  );
}
