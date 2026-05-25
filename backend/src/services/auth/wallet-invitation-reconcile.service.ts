/**
 * Wallet-side auto-acceptance of pending tenant-member invitations.
 *
 * Called by every wallet login route (phone-OTP verify in the
 * mode=logged_in branch, email-OTP verify, google/wallet) right after
 * the session is minted. Looks up every tenantMemberInvitations row
 * for the user's email and either accepts it (status=pending, not
 * expired) or surfaces it as expired so the wallet UI can offer
 * request-to-join (Plan #4) as the recourse.
 *
 * If reconciliation throws, the caller logs and continues - a working
 * session must never fail because of an invite race.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 10.4
 */
import { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import { markTenantMemberInvitationAccepted } from '../domain-member-invitation-read.service';
import type { TenantMemberInvitationDocument } from '../../models/domain/tenant.models';

export interface ReconcileResult {
  acceptedTenantIds: string[];
  expiredTenantIds: string[];
}

/**
 * Auto-accept every pending non-expired invite that matches the user's
 * email, then promote the NexusIdentity from 'invited' to 'active' if
 * any acceptances happened.
 *
 * @param db Mongo handle
 * @param args.nexusIdentityId domain identity id (NOT prisma user id)
 * @param args.email user's email; caller must lowercase first
 */
export async function reconcilePendingInvitations(
  db: Db,
  args: { nexusIdentityId: string; email: string },
): Promise<ReconcileResult> {
  const invites = await db
    .collection<TenantMemberInvitationDocument>(DOMAIN_COLLECTIONS.tenantMemberInvitations)
    .find({ normalizedEmail: args.email })
    .toArray();

  const now = new Date();
  const acceptedTenantIds: string[] = [];
  const expiredTenantIds: string[] = [];

  for (const invite of invites) {
    if (invite.status !== 'pending') continue;
    if (invite.expiresAt <= now) {
      expiredTenantIds.push(invite.tenantId);
      continue;
    }
    try {
      await markTenantMemberInvitationAccepted(invite, args.nexusIdentityId);
      acceptedTenantIds.push(invite.tenantId);
    } catch (acceptErr) {
      // Best-effort: one bad invite must not block the others or the login.
      // Reconciliation runs on every subsequent login, so transient failures
      // self-heal. Log so we can spot persistent failures.
      console.error(
        '[wallet-auth] invite acceptance failed for tenant',
        invite.tenantId,
        acceptErr,
      );
    }
  }

  if (acceptedTenantIds.length > 0) {
    await db
      .collection(DOMAIN_COLLECTIONS.nexusIdentities)
      .updateOne(
        { nexusIdentityId: args.nexusIdentityId, status: 'invited' },
        { $set: { status: 'active', updatedAt: new Date() } },
      );
  }

  return { acceptedTenantIds, expiredTenantIds };
}
