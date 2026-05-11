/**
 * Reads and accepts MongoDB-backed tenant member invitations.
 * Invite records stay independent so one email can join multiple tenants.
 */
import { prisma } from '../config/database';
import { getMongoDb } from '../config/mongo';
import { normalizeEmail } from '../config/platform-admins';
import { createError } from '../middleware/errorHandler';
import {
  getTenantDomainCollections,
  type TenantMemberInvitationDocument,
  type TenantUserRoleName,
} from '../models/domain';
import { hashToken } from '../utils/crypto';
import { syncDomainIdentityForLoginUser } from './domain-identity.service';

export interface TenantMemberInvitationPreview {
  invitationId?: string;
  tenantId?: string;
  tenantName: string;
  invitedEmail: string;
  roles: TenantUserRoleName[];
  status: string;
  expiresAt: string;
}

/**
 * Reads public-safe invitation details by raw token.
 * Input: raw invite token from the email URL.
 * Output: tenant name, email, role, status, and expiry without token hash.
 */
export async function getTenantMemberInvitationPreview(token: string): Promise<TenantMemberInvitationPreview> {
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const invite = await tenantCollections.tenantMemberInvitations.findOne({ tokenHash: hashToken(token) });
  if (!invite) throw createError('Invalid invitation link', 404);

  const now = new Date();
  if (invite.status === 'pending' && invite.expiresAt <= now) {
    await tenantCollections.tenantMemberInvitations.updateOne(
      { tenantMemberInvitationId: invite.tenantMemberInvitationId },
      { $set: { status: 'expired', updatedAt: now } },
    );
    invite.status = 'expired';
    // Reflect expiry on the contact record if one exists.
    void tenantCollections.tenantContacts.updateOne(
      { tenantId: invite.tenantId, normalizedEmail: invite.normalizedEmail },
      { $set: { status: 'expired', updatedAt: now } },
    ).catch(() => undefined);
  }

  const tenant = await tenantCollections.domainTenants.findOne(
    { tenantId: invite.tenantId },
    { projection: { organizationName: 1 } },
  );

  const roles = Array.isArray(invite.roles) && invite.roles.length > 0
    ? (invite.roles as TenantUserRoleName[])
    : (invite as unknown as { role?: string }).role
      ? [(invite as unknown as { role: string }).role as TenantUserRoleName]
      : ([] as TenantUserRoleName[]);

  return {
    tenantName: tenant?.organizationName ?? 'Nexus',
    invitedEmail: invite.normalizedEmail,
    roles,
    status: invite.status,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

/**
 * Lists pending invitations that belong to the authenticated user's email.
 * Input: Prisma user id from the authenticated request.
 * Output: public-safe pending invite cards across all tenants.
 */
export async function listMyPendingTenantMemberInvitations(userId: string): Promise<{
  invitations: TenantMemberInvitationPreview[];
}> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw createError('User not found', 404);

  const normalizedEmail = normalizeEmail(user.email);
  const now = new Date();
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);

  // Find which tenant+email pairs are about to be expired before updating them.
  const expiredInvites = await tenantCollections.tenantMemberInvitations
    .find({ normalizedEmail, status: 'pending', expiresAt: { $lte: now } })
    .project<{ tenantId: string }>({ tenantId: 1 })
    .toArray();

  await tenantCollections.tenantMemberInvitations.updateMany(
    { normalizedEmail, status: 'pending', expiresAt: { $lte: now } },
    { $set: { status: 'expired', updatedAt: now } },
  );

  // Reflect expiry on matching contact records (fire-and-forget).
  if (expiredInvites.length > 0) {
    const expiredTenantIds = expiredInvites.map((inv) => inv.tenantId);
    void tenantCollections.tenantContacts.updateMany(
      { normalizedEmail, tenantId: { $in: expiredTenantIds }, status: 'pending' },
      { $set: { status: 'expired', updatedAt: now } },
    ).catch(() => undefined);
  }

  const invitations = await tenantCollections.tenantMemberInvitations
    .find(
      { normalizedEmail, status: 'pending', expiresAt: { $gt: now } },
      {
        sort: { createdAt: -1 },
        projection: {
          tenantMemberInvitationId: 1,
          tenantId: 1,
          normalizedEmail: 1,
          roles: 1,
          status: 1,
          expiresAt: 1,
        },
      },
    )
    .toArray();
  const tenantIds = Array.from(new Set(invitations.map((invitation) => invitation.tenantId)));
  const tenants = await tenantCollections.domainTenants
    .find({ tenantId: { $in: tenantIds } }, { projection: { tenantId: 1, organizationName: 1 } })
    .toArray();
  const tenantNameById = new Map(tenants.map((tenant) => [tenant.tenantId, tenant.organizationName]));

  return {
    invitations: invitations.map((invitation) => {
      const roles = Array.isArray(invitation.roles) && invitation.roles.length > 0
        ? (invitation.roles as TenantUserRoleName[])
        : (invitation as unknown as { role?: string }).role
          ? [(invitation as unknown as { role: string }).role as TenantUserRoleName]
          : ([] as TenantUserRoleName[]);
      return {
        invitationId: invitation.tenantMemberInvitationId,
        tenantId: invitation.tenantId,
        tenantName: tenantNameById.get(invitation.tenantId) ?? 'Nexus',
        invitedEmail: invitation.normalizedEmail,
        roles,
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
      };
    }),
  };
}

/**
 * Applies the accepted state to a verified invitation record.
 * Input: invitation document and accepted identity id.
 * Output: accepted tenant id, role, and idempotency flag.
 */
/**
 * Resolves roles from an invitation document, falling back to legacy single role field.
 * Input: invitation document from Mongo.
 * Output: array of role names.
 */
function resolveInvitationRoles(invite: TenantMemberInvitationDocument): TenantUserRoleName[] {
  if (Array.isArray(invite.roles) && invite.roles.length > 0) {
    return invite.roles as TenantUserRoleName[];
  }
  const legacyRole = (invite as unknown as { role?: string }).role;
  return legacyRole ? [legacyRole as TenantUserRoleName] : [];
}

async function markTenantMemberInvitationAccepted(
  invite: TenantMemberInvitationDocument,
  acceptedByIdentityId: string,
): Promise<{ tenantId: string; roles: TenantUserRoleName[]; alreadyAccepted: boolean }> {
  const now = new Date();
  const roles = resolveInvitationRoles(invite);
  if (invite.status === 'revoked') throw createError('Invitation was revoked', 410);
  if (invite.expiresAt <= now) throw createError('Invitation link expired', 410);
  if (invite.status === 'accepted') {
    return { tenantId: invite.tenantId, roles, alreadyAccepted: true };
  }
  if (invite.status !== 'pending') throw createError(`Invitation is ${invite.status}`, 409);

  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const updateResult = await tenantCollections.tenantMemberInvitations.updateOne(
    { tenantMemberInvitationId: invite.tenantMemberInvitationId, status: 'pending' },
    { $set: { status: 'accepted', acceptedByIdentityId, acceptedAt: now, updatedAt: now } },
  );
  if (updateResult.matchedCount !== 1) throw createError('Invitation could not be accepted', 409);

  // Advance contact to active and record acceptance time.
  // Fire-and-forget — a missing contact record is not an error.
  void tenantCollections.tenantContacts.updateOne(
    { tenantId: invite.tenantId, normalizedEmail: invite.normalizedEmail },
    { $set: { status: 'active', lastActivityAt: now, updatedAt: now } },
  ).catch(() => undefined);

  return { tenantId: invite.tenantId, roles, alreadyAccepted: false };
}

/**
 * Loads an authenticated user and matching invitation record.
 * Input: Prisma user id plus either token or invitation id selector.
 * Output: domain identity and invitation after email and membership checks.
 */
async function loadMatchingInvitation(input: { userId: string; token?: string; invitationId?: string }) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, fullName: true, provider: true },
  });
  if (!user) throw createError('User not found', 404);

  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const filter = input.token
    ? { tokenHash: hashToken(input.token) }
    : { tenantMemberInvitationId: input.invitationId };
  const invite = await tenantCollections.tenantMemberInvitations.findOne(filter);
  if (!invite) throw createError(input.token ? 'Invalid invitation link' : 'Invitation not found', 404);
  if (invite.normalizedEmail !== normalizeEmail(user.email)) {
    throw createError('Invitation email does not match this account', 403);
  }

  const identity = await syncDomainIdentityForLoginUser(user);
  const tenantMember = await tenantCollections.tenantMembers.findOne({
    tenantId: invite.tenantId,
    nexusIdentityId: identity.nexusIdentityId,
    status: 'active',
  });
  if (!tenantMember) throw createError('Tenant membership was not found for this invite', 403);

  return { invite, identity };
}

/**
 * Accepts an invitation for the currently authenticated matching email.
 * Input: Prisma user id and raw invite token.
 * Output: accepted tenant id, role, and whether it was already accepted.
 */
export async function acceptTenantMemberInvitation(
  userId: string,
  token: string,
): Promise<{ tenantId: string; roles: TenantUserRoleName[]; alreadyAccepted: boolean }> {
  const { invite, identity } = await loadMatchingInvitation({ userId, token });
  return markTenantMemberInvitationAccepted(invite, identity.nexusIdentityId);
}

/**
 * Accepts one pending invitation selected from the authenticated user's list.
 * Input: Prisma user id and tenant member invitation id.
 * Output: accepted tenant id, roles, and whether it was already accepted.
 */
export async function acceptMyTenantMemberInvitationById(
  userId: string,
  invitationId: string,
): Promise<{ tenantId: string; roles: TenantUserRoleName[]; alreadyAccepted: boolean }> {
  const { invite, identity } = await loadMatchingInvitation({ userId, invitationId });
  return markTenantMemberInvitationAccepted(invite, identity.nexusIdentityId);
}
