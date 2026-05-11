/**
 * Tenant member action operations: change email, change roles, remove member.
 * All mutations are scoped to the manager's tenant — tenant id is never trusted
 * from the request body. Uses the same sequential-write pattern as the rest of
 * the domain services (no multi-document transactions).
 */
import { randomUUID } from 'crypto';
import { getMongoDb } from '../config/mongo';
import { normalizeEmail } from '../config/platform-admins';
import { createError } from '../middleware/errorHandler';
import {
  getIdentityDomainCollections,
  getTenantDomainCollections,
  type TenantUserRoleName,
} from '../models/domain';
import { syncDomainIdentityForMemberInvite } from './domain-identity.service';
import { buildMemberInviteLoginUrl, sendTenantMemberInviteEmail } from './domain-member-invite-email.service';
import { sendTenantMemberRemovedEmail, sendTenantInviteRevokedEmail } from './domain-member-remove-email.service';
import { requireTenantMemberPermission } from './domain-member.service';
import { generateToken, hashToken } from '../utils/crypto';

/**
 * Counts active admins in the tenant excluding one identity.
 * Input: tenant id and the identity id to exclude from the count.
 * Output: number of remaining admins (excluding the target identity).
 */
async function countOtherActiveAdmins(tenantId: string, excludeIdentityId: string): Promise<number> {
  const db = await getMongoDb();
  const identityCollections = getIdentityDomainCollections(db);
  return identityCollections.tenantUserRoles.countDocuments({
    tenantId,
    role: 'admin',
    nexusIdentityId: { $ne: excludeIdentityId },
  });
}

/**
 * Resolves the tenant name for use in emails.
 * Input: tenant id.
 * Output: organization name, or 'Nexus' as fallback.
 */
async function resolveTenantName(tenantId: string): Promise<string> {
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const tenant = await tenantCollections.domainTenants.findOne(
    { tenantId },
    { projection: { organizationName: 1 } },
  );
  return tenant?.organizationName ?? 'Nexus';
}

/**
 * Updates the roles of a tenant member.
 * Updates TenantUserRole documents and syncs roles on any still-pending invitation.
 * Guards against removing the last admin.
 * Input: manager user id, target member id, new role list.
 * Output: updated role list.
 */
export async function updateTenantMemberRoles(
  managerUserId: string,
  tenantMemberId: string,
  newRoles: TenantUserRoleName[],
): Promise<{ roles: TenantUserRoleName[] }> {
  const access = await requireTenantMemberPermission(managerUserId, 'member.manage');
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const identityCollections = getIdentityDomainCollections(db);
  const now = new Date();

  const member = await tenantCollections.tenantMembers.findOne({
    tenantMemberId,
    tenantId: access.tenantId,
  });
  if (!member) throw createError('Member not found', 404);

  const uniqueRoles = Array.from(new Set(newRoles)) as TenantUserRoleName[];

  // Last-admin guard: prevent removing admin if this is the only admin.
  const isLosingAdmin = !uniqueRoles.includes('admin');
  if (isLosingAdmin) {
    const otherAdmins = await countOtherActiveAdmins(access.tenantId, member.nexusIdentityId);
    if (otherAdmins === 0) {
      throw createError('Cannot remove the last admin from the tenant', 409);
    }
  }

  // Replace all TenantUserRole rows for this identity+tenant.
  await identityCollections.tenantUserRoles.deleteMany({
    tenantId: access.tenantId,
    nexusIdentityId: member.nexusIdentityId,
  });
  if (uniqueRoles.length > 0) {
    await identityCollections.tenantUserRoles.bulkWrite(
      uniqueRoles.map((role) => ({
        insertOne: {
          document: {
            tenantUserRoleId: `tenant_user_role_${randomUUID()}`,
            nexusIdentityId: member.nexusIdentityId,
            tenantId: access.tenantId,
            role,
            grantedByIdentityId: access.managerIdentityId,
            createdAt: now,
            updatedAt: now,
          },
        },
      })),
      { ordered: false },
    );
  }

  // Sync roles on any still-pending invitation so the email/acceptance record stays consistent.
  await tenantCollections.tenantMemberInvitations.updateOne(
    { tenantMemberId, tenantId: access.tenantId, status: 'pending' },
    { $set: { roles: uniqueRoles, updatedAt: now } },
  );

  return { roles: uniqueRoles };
}

/**
 * Changes the email of a tenant member whose invite has not yet been accepted.
 * Revokes the existing invite, unlinks the old member from the tenant, links or
 * creates a NexusIdentity for the new email, and sends a fresh invite.
 * Input: manager user id, target member id, new email address.
 * Output: new member id and invite id.
 */
export async function updateTenantMemberEmail(
  managerUserId: string,
  tenantMemberId: string,
  newEmail: string,
): Promise<{ tenantMemberId: string; invitationId: string }> {
  const access = await requireTenantMemberPermission(managerUserId, 'member.manage');
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const identityCollections = getIdentityDomainCollections(db);
  const now = new Date();

  const member = await tenantCollections.tenantMembers.findOne({
    tenantMemberId,
    tenantId: access.tenantId,
  });
  if (!member) throw createError('Member not found', 404);

  // Only allow email change before invite acceptance.
  const latestInvite = await tenantCollections.tenantMemberInvitations.findOne(
    { tenantMemberId, tenantId: access.tenantId },
    { sort: { createdAt: -1 } },
  );
  if (latestInvite && latestInvite.status === 'accepted') {
    throw createError('Cannot change email after the invite has been accepted', 409);
  }

  const newNormalized = normalizeEmail(newEmail);

  // Reject if another member in this tenant already has the new email.
  const newIdentityCheck = await identityCollections.nexusIdentities.findOne(
    { normalizedEmail: newNormalized },
    { projection: { nexusIdentityId: 1 } },
  );
  if (newIdentityCheck) {
    const conflict = await tenantCollections.tenantMembers.findOne({
      tenantId: access.tenantId,
      nexusIdentityId: newIdentityCheck.nexusIdentityId,
    });
    if (conflict && conflict.tenantMemberId !== tenantMemberId) {
      throw createError('A member with this email already exists in the tenant', 409);
    }
  }

  // Capture current roles and groups before removing old records.
  const oldRoles = (latestInvite?.roles ?? []) as TenantUserRoleName[];
  const oldGroupIds = latestInvite?.groupIds ?? [];

  // Revoke all pending invitations for the old member.
  await tenantCollections.tenantMemberInvitations.updateMany(
    { tenantMemberId, tenantId: access.tenantId, status: 'pending' },
    { $set: { status: 'revoked', updatedAt: now } },
  );

  const oldNormalizedEmail = latestInvite?.normalizedEmail;

  // Resolve tenant name once for both outgoing emails.
  const tenantName = await resolveTenantName(access.tenantId);

  // Notify old email that their invite was cancelled — best effort.
  if (oldNormalizedEmail) {
    void sendTenantInviteRevokedEmail({
      to: oldNormalizedEmail,
      tenantName,
      language: 'he',
    }).catch(() => undefined);
  }

  // Delete old member records for this tenant only.
  await tenantCollections.tenantMembers.deleteOne({ tenantMemberId, tenantId: access.tenantId });
  await identityCollections.tenantUserRoles.deleteMany({
    tenantId: access.tenantId,
    nexusIdentityId: member.nexusIdentityId,
  });
  await tenantCollections.memberGroupAssignments.deleteMany({
    tenantId: access.tenantId,
    tenantMemberId,
  });

  // Create new member records for the new email.
  const newIdentity = await syncDomainIdentityForMemberInvite({ email: newEmail });
  const newTenantMemberId = `tenant_member_${randomUUID()}`;
  await tenantCollections.tenantMembers.insertOne({
    tenantMemberId: newTenantMemberId,
    tenantId: access.tenantId,
    nexusIdentityId: newIdentity.nexusIdentityId,
    status: 'active',
    requireAdminApproval: false,
    customFields: {},
    createdAt: now,
    updatedAt: now,
  });

  if (oldRoles.length > 0) {
    await identityCollections.tenantUserRoles.bulkWrite(
      oldRoles.map((role) => ({
        insertOne: {
          document: {
            tenantUserRoleId: `tenant_user_role_${randomUUID()}`,
            nexusIdentityId: newIdentity.nexusIdentityId,
            tenantId: access.tenantId,
            role,
            grantedByIdentityId: access.managerIdentityId,
            createdAt: now,
            updatedAt: now,
          },
        },
      })),
      { ordered: false },
    );
  }

  if (oldGroupIds.length > 0) {
    await tenantCollections.memberGroupAssignments.bulkWrite(
      oldGroupIds.map((memberGroupId) => ({
        updateOne: {
          filter: { memberGroupId, tenantMemberId: newTenantMemberId },
          update: {
            $setOnInsert: {
              memberGroupAssignmentId: `member_group_assignment_${randomUUID()}`,
              tenantId: access.tenantId,
              memberGroupId,
              tenantMemberId: newTenantMemberId,
              createdAt: now,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  // Create a new pending invitation.
  const rawToken = generateToken(48);
  const invitationId = `tenant_member_invitation_${randomUUID()}`;
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await tenantCollections.tenantMemberInvitations.insertOne({
    tenantMemberInvitationId: invitationId,
    tenantId: access.tenantId,
    tenantMemberId: newTenantMemberId,
    nexusIdentityId: newIdentity.nexusIdentityId,
    invitedEmail: newEmail,
    normalizedEmail: newNormalized,
    roles: oldRoles,
    groupIds: oldGroupIds,
    tokenHash: hashToken(rawToken),
    status: 'pending',
    invitedByIdentityId: access.managerIdentityId,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  // Update the existing contact row's email in place (same row, new address).
  // Falls back to upsert if the old contact row didn't exist.
  void (async () => {
    const updated = oldNormalizedEmail
      ? await tenantCollections.tenantContacts.updateOne(
          { tenantId: access.tenantId, normalizedEmail: oldNormalizedEmail },
          { $set: { email: newEmail.trim().toLowerCase(), normalizedEmail: newNormalized, status: 'pending', updatedAt: now } },
        ).catch(() => null)
      : null;

    const didUpdate = updated && updated.matchedCount > 0;
    if (!didUpdate) {
      // No old row found — create a fresh contact for the new email.
      void tenantCollections.tenantContacts.updateOne(
        { tenantId: access.tenantId, normalizedEmail: newNormalized },
        {
          $set: { status: 'pending', email: newEmail.trim().toLowerCase(), normalizedEmail: newNormalized, updatedAt: now },
          $setOnInsert: {
            tenantContactId: `tenant_contact_${randomUUID()}`,
            tenantId: access.tenantId,
            displayName: '',
            createdAt: now,
          },
        },
        { upsert: true },
      ).catch(() => undefined);
    }
  })();

  // Send invite to new email — best effort.
  void sendTenantMemberInviteEmail({
    to: newNormalized,
    tenantName,
    roles: oldRoles,
    inviteUrl: buildMemberInviteLoginUrl(rawToken, 'he'),
    expiresAt,
    language: 'he',
  }).catch(() => undefined);

  return { tenantMemberId: newTenantMemberId, invitationId };
}

/**
 * Removes a tenant member from the tenant.
 * Deletes all tenant-scoped Mongo records: TenantMember, TenantUserRole,
 * MemberGroupAssignment, TenantContact. Revokes pending invitations.
 * Never touches NexusIdentity, ContactProfile, or Prisma User.
 * Input: manager user id, target member id, optional email suppress flag.
 * Output: void on success.
 */
export async function removeTenantMemberFromTenant(
  managerUserId: string,
  tenantMemberId: string,
  opts: { suppressEmail?: boolean } = {},
): Promise<void> {
  const access = await requireTenantMemberPermission(managerUserId, 'member.manage');
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const identityCollections = getIdentityDomainCollections(db);
  const now = new Date();

  const member = await tenantCollections.tenantMembers.findOne({
    tenantMemberId,
    tenantId: access.tenantId,
  });
  if (!member) throw createError('Member not found', 404);

  // Self-action guard.
  if (member.nexusIdentityId === access.managerIdentityId) {
    throw createError('Cannot remove your own membership', 403);
  }

  // Last-admin guard.
  const isAdmin = await identityCollections.tenantUserRoles.findOne({
    tenantId: access.tenantId,
    nexusIdentityId: member.nexusIdentityId,
    role: 'admin',
  });
  if (isAdmin) {
    const otherAdmins = await countOtherActiveAdmins(access.tenantId, member.nexusIdentityId);
    if (otherAdmins === 0) {
      throw createError('Cannot remove the last admin from the tenant', 409);
    }
  }

  // Load identity email + language for the removal email.
  const identity = await identityCollections.nexusIdentities.findOne(
    { nexusIdentityId: member.nexusIdentityId },
    { projection: { normalizedEmail: 1, displayName: 1, locale: 1 } },
  );

  // Revoke pending invitations.
  await tenantCollections.tenantMemberInvitations.updateMany(
    { tenantMemberId, tenantId: access.tenantId, status: 'pending' },
    { $set: { status: 'revoked', updatedAt: now } },
  );

  // Delete tenant-scoped records.
  await tenantCollections.tenantMembers.deleteOne({ tenantMemberId, tenantId: access.tenantId });
  await identityCollections.tenantUserRoles.deleteMany({
    tenantId: access.tenantId,
    nexusIdentityId: member.nexusIdentityId,
  });
  await tenantCollections.memberGroupAssignments.deleteMany({
    tenantId: access.tenantId,
    tenantMemberId,
  });
  // Remove the tenant contact record (tenant-scoped address book entry).
  if (identity?.normalizedEmail) {
    await tenantCollections.tenantContacts.deleteOne({
      tenantId: access.tenantId,
      normalizedEmail: identity.normalizedEmail,
    });
  }

  // Send removal notification email — best effort, never blocks the operation.
  if (!opts.suppressEmail && identity?.normalizedEmail) {
    const tenantName = await resolveTenantName(access.tenantId);
    void sendTenantMemberRemovedEmail({
      to: identity.normalizedEmail,
      displayName: identity.displayName,
      tenantName,
      language: (identity.locale as 'he' | 'en') ?? 'he',
    }).catch(() => undefined);
  }
}

/**
 * Removes a tenant contact from the address book.
 * If the contact has a linked TenantMember (was invited), delegates to
 * removeTenantMemberFromTenant which also sends a removal email.
 * If the contact was never invited (inactive), silently deletes the record.
 * Input: manager user id, tenant contact id.
 * Output: void on success.
 */
export async function removeTenantContact(
  managerUserId: string,
  tenantContactId: string,
): Promise<void> {
  const access = await requireTenantMemberPermission(managerUserId, 'member.manage');
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);

  const contact = await tenantCollections.tenantContacts.findOne({
    tenantContactId,
    tenantId: access.tenantId,
  });
  if (!contact) throw createError('Contact not found', 404);

  // Resolve NexusIdentity by normalizedEmail, then find the TenantMember.
  const identityCollections2 = getIdentityDomainCollections(db);
  const linkedIdentity = await identityCollections2.nexusIdentities.findOne(
    { normalizedEmail: contact.normalizedEmail },
    { projection: { nexusIdentityId: 1 } },
  );
  const linkedMember = linkedIdentity
    ? await tenantCollections.tenantMembers.findOne({
        tenantId: access.tenantId,
        nexusIdentityId: linkedIdentity.nexusIdentityId,
      })
    : null;

  if (linkedMember) {
    await removeTenantMemberFromTenant(managerUserId, linkedMember.tenantMemberId, {
      suppressEmail: contact.status === 'inactive',
    });
    return;
  }

  // Truly inactive contact with no member record — silent delete.
  await tenantCollections.tenantContacts.deleteOne({
    tenantContactId,
    tenantId: access.tenantId,
  });
}

/**
 * Changes the email of a contact in the address book.
 * For inactive contacts: rewrites the email field only.
 * For pending/expired contacts: delegates to updateTenantMemberEmail which
 * revokes the old invite and sends a new one to the new address.
 * Input: manager user id, tenant contact id, new email.
 * Output: void on success.
 */
export async function updateTenantContactEmail(
  managerUserId: string,
  tenantContactId: string,
  newEmail: string,
): Promise<void> {
  const access = await requireTenantMemberPermission(managerUserId, 'member.manage');
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const now = new Date();

  const contact = await tenantCollections.tenantContacts.findOne({
    tenantContactId,
    tenantId: access.tenantId,
  });
  if (!contact) throw createError('Contact not found', 404);

  const newNormalized = normalizeEmail(newEmail);

  if (contact.status === 'inactive') {
    // Simple email rewrite — no invite involved.
    const collision = await tenantCollections.tenantContacts.findOne({
      tenantId: access.tenantId,
      normalizedEmail: newNormalized,
      tenantContactId: { $ne: tenantContactId },
    });
    if (collision) throw createError('A contact with this email already exists', 409);

    await tenantCollections.tenantContacts.updateOne(
      { tenantContactId, tenantId: access.tenantId },
      { $set: { email: newEmail.trim().toLowerCase(), normalizedEmail: newNormalized, updatedAt: now } },
    );
    return;
  }

  // Pending or expired: resolve identity → member, then delegate.
  const identityCollections3 = getIdentityDomainCollections(db);
  const linkedIdentity3 = await identityCollections3.nexusIdentities.findOne(
    { normalizedEmail: contact.normalizedEmail },
    { projection: { nexusIdentityId: 1 } },
  );
  const linkedMember = linkedIdentity3
    ? await tenantCollections.tenantMembers.findOne({
        tenantId: access.tenantId,
        nexusIdentityId: linkedIdentity3.nexusIdentityId,
      })
    : null;
  if (!linkedMember) throw createError('Linked member record not found', 404);

  await updateTenantMemberEmail(managerUserId, linkedMember.tenantMemberId, newEmail);
}
