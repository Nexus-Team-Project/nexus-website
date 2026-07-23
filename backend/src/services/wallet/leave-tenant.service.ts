/**
 * Wallet "leave tenant" - a member removes their OWN membership in a tenant.
 *
 * Hard delete by owner decision (spec 2026-07-20-wallet-leave-tenant-design):
 * the tenantMembers row and the 'member' tenantUserRoles row are deleted, so
 * the user disappears from the dashboard Registered Members tab immediately.
 * The tenantContacts row is deliberately KEPT (the business keeps its contact).
 * The caller's tenantJoinRequests rows for the tenant are DELETED: the wallet
 * discovery sheet treats an approved/auto_accepted request as "already joined"
 * and hides the org, so leftover history would make the org unjoinable forever
 * (amendment 2026-07-20b to the leave-tenant spec).
 *
 * Only plain members may leave: any privileged role (owner/admin/...) in the
 * tenant blocks the wallet leave - staff are managed from the dashboard.
 */
import type { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import { TENANT_JOIN_REQUEST_COLLECTION } from '../../models/auth/tenant-join-request.models';

/**
 * Remove the caller's own membership in a tenant.
 *
 * @param db Mongo handle.
 * @param args.nexusIdentityId caller identity, derived server-side from the
 *        authenticated session - never trusted from the client.
 * @param args.tenantId the tenant to leave (URL param, membership re-checked here).
 * @throws Error('privileged_role') when the caller holds any non-member role
 *         in the tenant (leave is member-only; staff use the dashboard).
 * @throws Error('not_a_member') when the caller has no membership row.
 */
export async function leaveTenant(
  db: Db,
  args: { nexusIdentityId: string; tenantId: string },
): Promise<void> {
  const roles = await db
    .collection<{ role: string }>(DOMAIN_COLLECTIONS.tenantUserRoles)
    .find(
      { nexusIdentityId: args.nexusIdentityId, tenantId: args.tenantId },
      { projection: { role: 1 } },
    )
    .toArray();
  if (roles.some((r) => r.role !== 'member')) throw new Error('privileged_role');

  const member = await db
    .collection(DOMAIN_COLLECTIONS.tenantMembers)
    .findOne(
      { nexusIdentityId: args.nexusIdentityId, tenantId: args.tenantId },
      { projection: { _id: 1 } },
    );
  if (!member) throw new Error('not_a_member');

  await db
    .collection(DOMAIN_COLLECTIONS.tenantMembers)
    .deleteOne({ nexusIdentityId: args.nexusIdentityId, tenantId: args.tenantId });
  await db
    .collection(DOMAIN_COLLECTIONS.tenantUserRoles)
    .deleteMany({ nexusIdentityId: args.nexusIdentityId, tenantId: args.tenantId, role: 'member' });
  // Drop the caller's join-request rows for this tenant so the discovery
  // sheet lists the org as joinable again (it hides orgs with an
  // approved/auto_accepted request as an "already a member" proxy).
  await db
    .collection(TENANT_JOIN_REQUEST_COLLECTION)
    .deleteMany({ nexusIdentityId: args.nexusIdentityId, tenantId: args.tenantId });

  // If this tenant was the member's default landing context, clear it; the
  // effective-default computation in computeWalletMeRouter falls back cleanly.
  await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).updateOne(
    { nexusIdentityId: args.nexusIdentityId, walletDefaultTenantId: args.tenantId },
    { $unset: { walletDefaultTenantId: '' }, $set: { updatedAt: new Date() } },
  );
}
