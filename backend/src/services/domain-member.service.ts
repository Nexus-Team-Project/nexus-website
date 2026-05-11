/**
 * Implements MongoDB-backed tenant member management.
 * Member invites follow FLOW-005 and do not use legacy Prisma organizations.
 */
import { randomUUID } from 'crypto';
import { prisma } from '../config/database';
import { getMongoDb } from '../config/mongo';
import { createError } from '../middleware/errorHandler';
import {
  getIdentityDomainCollections,
  getTenantDomainCollections,
  type TenantUserRoleName,
} from '../models/domain';
import type { InviteTenantMemberInput } from '../schemas/domain-member.schemas';
import { getDomainAuthorizationContext, hasDomainPermission } from './domain-authorization.service';
import { syncDomainIdentityForLoginUser, syncDomainIdentityForMemberInvite } from './domain-identity.service';
import { syncDomainTenantMembership } from './domain-tenant-sync.service';
import { getUserContext } from './onboarding.service';
import { getOnboardingCollections } from '../models/onboarding.models';
import { ObjectId } from 'mongodb';
import { buildMemberInviteLoginUrl, sendTenantMemberInviteEmail } from './domain-member-invite-email.service';
import { generateToken, hashToken } from '../utils/crypto';
import type { DomainPermission } from './domain-permissions.service';

export interface InviteTenantMemberResponse {
  tenantId: string;
  tenantMemberId: string;
  nexusIdentityId: string;
  email: string;
  roles: TenantUserRoleName[];
  status: 'active';
  groupIds: string[];
  invitationId: string;
  inviteUrl: string;
  expiresAt: string;
  emailSent: boolean;
}

export interface BulkInviteTenantMemberResult {
  email: string;
  ok: boolean;
  result?: InviteTenantMemberResponse;
  error?: string;
}

/**
 * Loads trusted login data for a member management request.
 * Input: Prisma user id from the authenticated request.
 * Output: minimal login user fields or a 404 error.
 */
async function getMemberManagerLoginUser(userId: string): Promise<{
  id: string;
  email: string;
  fullName: string;
  provider: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, provider: true },
  });
  if (!user) throw createError('User not found', 404);
  return user;
}

/**
 * Requires one tenant member permission from Mongo domain roles.
 * Input: Prisma user id from the authenticated request and required permission.
 * Output: tenant id and manager identity id when permission is granted.
 */
export async function requireTenantMemberPermission(userId: string, permission: DomainPermission): Promise<{
  tenantId: string;
  managerIdentityId: string;
}> {
  const [user, context] = await Promise.all([getMemberManagerLoginUser(userId), getUserContext(userId)]);
  if (!context.isTenant || !context.tenantId) throw createError('Tenant access required', 403);

  const domainIdentity = await syncDomainIdentityForLoginUser(user);
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const tenantMember = await tenantCollections.tenantMembers.findOne({
    tenantId: context.tenantId,
    nexusIdentityId: domainIdentity.nexusIdentityId,
    status: 'active',
  });

  if (!tenantMember) {
    const legacyCollections = getOnboardingCollections(db);
    const legacyTenantId = new ObjectId(context.tenantId);
    const [legacyTenant, legacyMembership] = await Promise.all([
      legacyCollections.tenants.findOne({ _id: legacyTenantId }),
      legacyCollections.tenantMembers.findOne({ tenantId: legacyTenantId, userId, status: 'active' }),
    ]);
    if (legacyTenant && legacyMembership?._id) {
      await syncDomainTenantMembership({
        tenantId: legacyTenantId,
        tenant: legacyTenant,
        tenantMembershipId: legacyMembership._id,
        tenantMembership: legacyMembership,
        nexusIdentityId: domainIdentity.nexusIdentityId,
      });
    }
  }

  const authorization = await getDomainAuthorizationContext(domainIdentity.nexusIdentityId, context.tenantId);
  if (!hasDomainPermission(authorization, permission)) throw createError('Forbidden', 403);

  return {
    tenantId: context.tenantId,
    managerIdentityId: domainIdentity.nexusIdentityId,
  };
}

/**
 * Requires tenant admin-level member management permission.
 * Input: Prisma user id from the authenticated request.
 * Output: tenant id and manager identity id when invite/manage access is granted.
 */
export async function requireMemberManagementAccess(userId: string): Promise<{
  tenantId: string;
  managerIdentityId: string;
}> {
  return requireTenantMemberPermission(userId, 'member.invite');
}

/**
 * Validates that requested member groups belong to the tenant.
 * Input: tenant id and requested group ids.
 * Output: deduplicated group ids or a 400 error when any group is invalid.
 */
export async function validateTenantGroupIds(tenantId: string, groupIds: string[]): Promise<string[]> {
  const uniqueGroupIds = Array.from(new Set(groupIds));
  if (uniqueGroupIds.length === 0) return [];

  const db = await getMongoDb();
  const collections = getTenantDomainCollections(db);
  const foundGroups = await collections.memberGroups
    .find({ tenantId, memberGroupId: { $in: uniqueGroupIds } }, { projection: { memberGroupId: 1 } })
    .toArray();
  const foundIds = new Set(foundGroups.map((group) => group.memberGroupId));
  const missing = uniqueGroupIds.filter((groupId) => !foundIds.has(groupId));
  if (missing.length > 0) throw createError('One or more member groups were not found', 400);

  return uniqueGroupIds;
}

/**
 * Sends the invitation email and records provider metadata on the invite.
 * Input: invite metadata, raw token, and email language.
 * Output: true when the email provider accepted or skipped delivery.
 */
async function sendAndTrackInvitationEmail(input: {
  invitationId: string;
  email: string;
  displayName?: string;
  tenantName: string;
  roles: TenantUserRoleName[];
  token: string;
  expiresAt: Date;
  language: 'he' | 'en';
  shouldSendEmail: boolean;
}): Promise<boolean> {
  if (!input.shouldSendEmail) return false;

  const db = await getMongoDb();
  const collections = getTenantDomainCollections(db);
  const inviteUrl = buildMemberInviteLoginUrl(input.token, input.language);

  try {
    const messageId = await sendTenantMemberInviteEmail({
      to: input.email,
      displayName: input.displayName,
      tenantName: input.tenantName,
      roles: input.roles,
      inviteUrl,
      expiresAt: input.expiresAt,
      language: input.language,
    });

    await collections.tenantMemberInvitations.updateOne(
      { tenantMemberInvitationId: input.invitationId },
      {
        $set: {
          ...(messageId ? { emailMessageId: messageId } : {}),
          lastEmailSentAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
    return true;
  } catch (error) {
    console.error('[DomainMemberInvite] Email delivery failed', {
      invitationId: input.invitationId,
      email: input.email,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Invites one tenant member by email and activates tenant membership.
 * Input: manager user id and validated invitation data.
 * Output: created member identity, membership, role, and group assignment ids.
 */
export async function inviteTenantMemberByEmail(
  managerUserId: string,
  input: InviteTenantMemberInput,
): Promise<InviteTenantMemberResponse> {
  const access = await requireMemberManagementAccess(managerUserId);
  const invitedIdentity = await syncDomainIdentityForMemberInvite({
    email: input.email,
    displayName: input.displayName,
  });
  const groupIds = await validateTenantGroupIds(access.tenantId, input.groupIds);
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const identityCollections = getIdentityDomainCollections(db);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const existingMembership = await tenantCollections.tenantMembers.findOne({
    tenantId: access.tenantId,
    nexusIdentityId: invitedIdentity.nexusIdentityId,
  });
  if (existingMembership) throw createError('membership_exists', 409);

  const tenantMemberId = `tenant_member_${randomUUID()}`;
  await tenantCollections.tenantMembers.insertOne({
    tenantMemberId,
    tenantId: access.tenantId,
    nexusIdentityId: invitedIdentity.nexusIdentityId,
    status: 'active',
    employeeId: input.employeeId,
    requireAdminApproval: false,
    customFields: input.customFields,
    createdAt: now,
    updatedAt: now,
  });

  const uniqueRoles = Array.from(new Set(input.roles));
  await identityCollections.tenantUserRoles.bulkWrite(
    uniqueRoles.map((role) => ({
      updateOne: {
        filter: { tenantId: access.tenantId, nexusIdentityId: invitedIdentity.nexusIdentityId, role },
        update: {
          $setOnInsert: {
            tenantUserRoleId: `tenant_user_role_${randomUUID()}`,
            nexusIdentityId: invitedIdentity.nexusIdentityId,
            tenantId: access.tenantId,
            role,
            grantedByIdentityId: access.managerIdentityId,
            createdAt: now,
          },
          $set: { updatedAt: now },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  if (groupIds.length > 0) {
    await tenantCollections.memberGroupAssignments.bulkWrite(
      groupIds.map((memberGroupId) => ({
        updateOne: {
          filter: { memberGroupId, tenantMemberId },
          update: {
            $setOnInsert: {
              memberGroupAssignmentId: `member_group_assignment_${randomUUID()}`,
              tenantId: access.tenantId,
              memberGroupId,
              tenantMemberId,
              createdAt: now,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  const tenant = await tenantCollections.domainTenants.findOne(
    { tenantId: access.tenantId },
    { projection: { organizationName: 1 } },
  );
  const rawToken = generateToken(48);
  const invitationId = `tenant_member_invitation_${randomUUID()}`;
  await tenantCollections.tenantMemberInvitations.insertOne({
    tenantMemberInvitationId: invitationId,
    tenantId: access.tenantId,
    tenantMemberId,
    nexusIdentityId: invitedIdentity.nexusIdentityId,
    invitedEmail: input.email,
    normalizedEmail: invitedIdentity.normalizedEmail,
    roles: uniqueRoles,
    groupIds,
    tokenHash: hashToken(rawToken),
    status: 'pending',
    invitedByIdentityId: access.managerIdentityId,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  // Advance contact status to pending if a contact record exists for this email+tenant.
  void tenantCollections.tenantContacts.updateOne(
    { tenantId: access.tenantId, normalizedEmail: invitedIdentity.normalizedEmail },
    { $set: { status: 'pending', updatedAt: now } },
  ).catch(() => undefined);

  const emailSent = await sendAndTrackInvitationEmail({
    invitationId,
    email: invitedIdentity.normalizedEmail,
    displayName: input.displayName,
    tenantName: tenant?.organizationName ?? 'Nexus',
    roles: uniqueRoles,
    token: rawToken,
    expiresAt,
    language: input.language,
    shouldSendEmail: input.sendEmail,
  });

  return {
    tenantId: access.tenantId,
    tenantMemberId,
    nexusIdentityId: invitedIdentity.nexusIdentityId,
    email: invitedIdentity.normalizedEmail,
    roles: uniqueRoles,
    status: 'active',
    groupIds,
    invitationId,
    inviteUrl: buildMemberInviteLoginUrl(rawToken, input.language),
    expiresAt: expiresAt.toISOString(),
    emailSent,
  };
}

/**
 * Invites many tenant members independently from one dashboard submit.
 * Input: manager user id and validated invite rows.
 * Output: per-email success or failure results; one bad row does not stop all.
 */
export async function bulkInviteTenantMembersByEmail(
  managerUserId: string,
  invitations: InviteTenantMemberInput[],
): Promise<{ results: BulkInviteTenantMemberResult[] }> {
  const results: BulkInviteTenantMemberResult[] = [];

  for (const invitation of invitations) {
    try {
      const result = await inviteTenantMemberByEmail(managerUserId, invitation);
      results.push({ email: invitation.email, ok: true, result });
    } catch (error) {
      results.push({
        email: invitation.email,
        ok: false,
        error: error instanceof Error ? error.message : 'invite_failed',
      });
    }
  }

  return { results };
}
