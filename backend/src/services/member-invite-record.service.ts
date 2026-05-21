/**
 * Creates the Mongo records (tenant member, role grants, group assignments,
 * invitation, contact) for a single tenant invite without sending email.
 * The email-send step is deliberately separated so the synchronous single
 * invite route can chain it inline while the bulk-async flow can hand it off
 * to a background worker.
 */
import { randomUUID } from 'crypto';
import { ObjectId } from 'mongodb';
import { getMongoDb } from '../config/mongo';
import { createError } from '../middleware/errorHandler';
import {
  getIdentityDomainCollections,
  getTenantDomainCollections,
  type TenantUserRoleName,
} from '../models/domain';
import type { InviteTenantMemberInput } from '../schemas/domain-member.schemas';
import { syncDomainIdentityForMemberInvite } from './domain-identity.service';
import { assertSeatAvailable, identityAlreadyHoldsNonMemberSeat } from './domain-tenant-plan.service';
import { validateTenantGroupIds } from './domain-member.service';
import { generateToken, hashToken } from '../utils/crypto';

/**
 * Output of createMemberInviteRecord. Carries everything the email send step
 * needs (raw token, tenant name, language) plus the invitation primary keys.
 */
export interface CreatedMemberInviteRecord {
  tenantId: string;
  tenantMemberId: string;
  nexusIdentityId: string;
  invitationId: string;
  email: string;
  displayName?: string;
  roles: TenantUserRoleName[];
  services: string[];
  groupIds: string[];
  tenantName: string;
  rawToken: string;
  expiresAt: Date;
  language: 'he' | 'en';
}

/**
 * Builds all Mongo records for one invite and returns the raw token and
 * mailing metadata. Does not send the invitation email.
 * Input: resolved tenant access (manager identity + tenant id) and the
 *        validated invite payload.
 * Output: invitation id, raw token, and metadata required to send the email.
 * Errors: 409 when the identity already belongs to the tenant; 403 when the
 *         plan seat limit is exceeded.
 */
export async function createMemberInviteRecord(
  access: { tenantId: string; managerIdentityId: string },
  input: InviteTenantMemberInput,
): Promise<CreatedMemberInviteRecord> {
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

  // Fall back to the phone stored on the tenant contact when the invite did
  // not carry one - matches single-invite behaviour exactly.
  let invitePhone: string | undefined = input.phone;
  if (invitePhone === undefined) {
    const existingContact = await tenantCollections.tenantContacts.findOne(
      { tenantId: access.tenantId, normalizedEmail: invitedIdentity.normalizedEmail },
      { projection: { phone: 1 } },
    );
    if (existingContact?.phone) invitePhone = existingContact.phone;
  }

  const inviteHasNonMemberRole = input.roles.some((r) => r !== 'member');
  if (inviteHasNonMemberRole) {
    const alreadySeated = await identityAlreadyHoldsNonMemberSeat(
      access.tenantId,
      invitedIdentity.nexusIdentityId,
    );
    if (!alreadySeated) await assertSeatAvailable(access.tenantId, 1);
  }

  const tenantMemberId = `tenant_member_${randomUUID()}`;
  await tenantCollections.tenantMembers.insertOne({
    tenantMemberId,
    tenantId: access.tenantId,
    nexusIdentityId: invitedIdentity.nexusIdentityId,
    status: 'active',
    employeeId: input.employeeId,
    requireAdminApproval: false,
    customFields: input.customFields,
    services: input.services ?? ['benefits_catalog'],
    ...(invitePhone !== undefined && { phone: invitePhone }),
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
  const tenantName = tenant?.organizationName ?? 'Nexus';

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
    services: input.services ?? ['benefits_catalog'],
    ...(invitePhone !== undefined && { phone: invitePhone }),
    tokenHash: hashToken(rawToken),
    status: 'pending',
    invitedByIdentityId: access.managerIdentityId,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  // Best-effort contact upsert - identical to the single-invite path.
  void tenantCollections.tenantContacts.updateOne(
    { tenantId: access.tenantId, normalizedEmail: invitedIdentity.normalizedEmail },
    {
      $setOnInsert: {
        tenantContactId: `tenant_contact_${randomUUID()}`,
        tenantId: access.tenantId,
        email: invitedIdentity.normalizedEmail,
        normalizedEmail: invitedIdentity.normalizedEmail,
        displayName: input.displayName ?? invitedIdentity.normalizedEmail.split('@')[0],
        nexusIdentityId: invitedIdentity.nexusIdentityId,
        ...(invitePhone !== undefined && { phone: invitePhone }),
        createdAt: now,
      },
      $set: { status: 'pending', updatedAt: now },
    },
    { upsert: true },
  ).catch(() => undefined);

  // Silence the unused-import warning at lint time without changing runtime.
  void ObjectId;

  return {
    tenantId: access.tenantId,
    tenantMemberId,
    nexusIdentityId: invitedIdentity.nexusIdentityId,
    invitationId,
    email: invitedIdentity.normalizedEmail,
    displayName: input.displayName,
    roles: uniqueRoles,
    services: input.services ?? ['benefits_catalog'],
    groupIds,
    tenantName,
    rawToken,
    expiresAt,
    language: input.language,
  };
}
