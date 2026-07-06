/**
 * Admin org management: NEXUS platform admins create tenants on behalf of
 * future owners (creator-only - the admin never becomes a member), list them,
 * and assign/remove the single external owner.
 *
 * Security model: callers are already platform-admin-gated at the route. The
 * assignment blocks (platform admins and emails holding owner/admin anywhere)
 * are enforced HERE - the service is the boundary, the frontend only hints.
 *
 * Spec: docs/superpowers/specs/2026-07-05-admin-org-management-design.md
 */
import { randomUUID } from 'crypto';
import { getMongoDb } from '../config/mongo';
import { createError } from '../middleware/errorHandler';
import { getOnboardingCollections, type TenantDocument } from '../models/onboarding.models';
import { getTenantDomainCollections, getIdentityDomainCollections } from '../models/domain';
import type { LogoCrop, TenantAdminCreated, TenantOwnerAssignment } from '../models/domain/tenant.models';
import type { WorkspaceSetupInput } from '../schemas/onboarding.schemas';
import { syncDomainTenantCoreDocs } from './domain-tenant-sync.service';
import { syncDomainIdentityForMemberInvite } from './domain-identity.service';
import { isPlatformAdminEmail } from '../utils/platform-admin';
import { normalizeEmail } from '../config/platform-admins';
import { sendOrgOwnerAssignedEmail, type EmailLanguage } from './org-owner-email.service';

/** One row of the admin organizations list. */
export interface AdminOrganizationRow {
  tenantId: string;
  organizationName: string;
  logoUrl: string | null;
  logoCrop: LogoCrop | null;
  brandColor: string | null;
  /** ISO date the org was created from the admin page. */
  createdAt: string;
  createdByAdminEmail: string;
  ownerState: 'none' | 'assigned' | 'active';
  ownerEmail: string | null;
}

/** The domain-tenant fields toRow reads (subset of the domain tenant doc). */
interface AdminOrgTenantDoc {
  tenantId: string;
  organizationName: string;
  logoUrl?: string | null;
  logoCrop?: LogoCrop | null;
  brandColor?: string | null;
  adminCreated?: TenantAdminCreated;
  ownerAssignment?: TenantOwnerAssignment | null;
}

/**
 * Maps a domain tenant doc to a list row (pure).
 * Input: domain tenant doc with adminCreated set. Output: AdminOrganizationRow.
 */
function toRow(doc: AdminOrgTenantDoc): AdminOrganizationRow {
  const assignment = doc.ownerAssignment ?? null;
  return {
    tenantId: doc.tenantId,
    organizationName: doc.organizationName,
    logoUrl: doc.logoUrl ?? null,
    logoCrop: doc.logoCrop ?? null,
    brandColor: doc.brandColor ?? null,
    createdAt: (doc.adminCreated?.createdAt ?? new Date()).toISOString(),
    createdByAdminEmail: doc.adminCreated?.createdByAdminEmail ?? '',
    ownerState: assignment == null ? 'none' : assignment.activatedAt ? 'active' : 'assigned',
    ownerEmail: assignment?.email ?? null,
  };
}

/**
 * Creates a tenant on behalf of a future owner. The calling admin is stamped
 * as creator (audit) but gets NO membership/role rows, so their dashboard
 * context stays platform_admin. The tenant follows the normal sandbox ->
 * business setup -> approval -> go-live lifecycle, driven by the future owner.
 * Input: acting admin ids/email + validated wizard payload + optional brand color.
 * Output: the new AdminOrganizationRow.
 */
export async function createAdminOrganization(input: {
  adminUserId: string;
  adminIdentityId: string;
  adminEmail: string;
  data: WorkspaceSetupInput;
  brandColor?: string;
}): Promise<AdminOrganizationRow> {
  const db = await getMongoDb();
  const collections = getOnboardingCollections(db);
  const now = new Date();

  const tenant: TenantDocument = {
    organizationName: input.data.organizationName,
    website: input.data.website,
    businessDescription: input.data.businessDescription,
    selectedUseCases: input.data.selectedUseCases,
    contactPhone: input.data.contactPhone,
    contactRole: input.data.contactRole,
    createdByUserId: input.adminUserId,
    status: 'active',
    businessSetupStatus: 'not_started',
    createdAt: now,
    updatedAt: now,
  };
  const tenantInsert = await collections.tenants.insertOne(tenant);
  const tenantId = tenantInsert.insertedId.toHexString();

  await syncDomainTenantCoreDocs({
    tenantId: tenantInsert.insertedId,
    tenant,
    createdByIdentityId: input.adminIdentityId,
  });

  const tenantCollections = getTenantDomainCollections(db);
  await tenantCollections.domainTenants.updateOne(
    { tenantId },
    {
      $set: {
        adminCreated: { createdByAdminEmail: normalizeEmail(input.adminEmail), createdAt: now },
        ...(input.brandColor ? { brandColor: input.brandColor } : {}),
        updatedAt: now,
      },
    },
  );

  const doc = await tenantCollections.domainTenants.findOne({ tenantId });
  return toRow(doc as unknown as AdminOrgTenantDoc);
}

/**
 * Escapes user text for a safe case-insensitive $regex.
 * Input: raw search string. Output: regex-escaped string.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lists admin-created tenants, newest first.
 * Input: page/limit (+ optional org-name search). Output: { items, total }.
 */
export async function listAdminOrganizations(q: {
  page: number;
  limit: number;
  search?: string;
}): Promise<{ items: AdminOrganizationRow[]; total: number }> {
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);

  const filter: Record<string, unknown> = { adminCreated: { $exists: true } };
  if (q.search && q.search.trim()) {
    filter.organizationName = { $regex: escapeRegex(q.search.trim()), $options: 'i' };
  }

  const [total, docs] = await Promise.all([
    tenantCollections.domainTenants.countDocuments(filter),
    tenantCollections.domainTenants
      .find(filter)
      .sort({ 'adminCreated.createdAt': -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .toArray(),
  ]);

  return { items: docs.map((d) => toRow(d as unknown as AdminOrgTenantDoc)), total };
}

/**
 * Assigns an external email as the tenant's owner. Immediate assignment:
 * identity + ACTIVE membership + 'owner' role are written now; the email is a
 * notification, not an acceptance link. Blocks (server-side, the real boundary):
 * NEXUS platform admins, and anyone already owner/admin of ANY tenant (a plain
 * member elsewhere is allowed).
 * Input: adminCreated tenantId, email, email language, acting admin email.
 * Output: updated AdminOrganizationRow. Throws 404/409 (with .code) on block.
 */
export async function assignOrganizationOwner(
  tenantId: string,
  email: string,
  language: EmailLanguage,
  assignedByAdminEmail: string,
): Promise<AdminOrganizationRow> {
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const identityCollections = getIdentityDomainCollections(db);

  const tenant = await tenantCollections.domainTenants.findOne({ tenantId });
  if (!tenant?.adminCreated) {
    throw createError('Organization not found', 404);
  }
  const existing = tenant.ownerAssignment ?? null;
  if (existing) {
    throw Object.assign(
      createError('Organization already has an assigned admin', 409),
      { code: existing.activatedAt ? 'owner_already_active' : 'owner_already_assigned' },
    );
  }

  const normalizedEmail = normalizeEmail(email);
  if (isPlatformAdminEmail(normalizedEmail)) {
    throw Object.assign(
      createError('This email belongs to a NEXUS platform admin', 409),
      { code: 'owner_is_platform_admin' },
    );
  }

  // Creates the identity when the email never registered ('invited' status);
  // links to the existing identity otherwise.
  const identity = await syncDomainIdentityForMemberInvite({ email: normalizedEmail });

  const privileged = await identityCollections.tenantUserRoles.findOne({
    nexusIdentityId: identity.nexusIdentityId,
    role: { $in: ['owner', 'admin'] },
  });
  if (privileged) {
    throw Object.assign(
      createError('This email is already an owner or admin of another organization', 409),
      { code: 'owner_has_privileged_role' },
    );
  }

  const now = new Date();
  await tenantCollections.tenantMembers.updateOne(
    { tenantId, nexusIdentityId: identity.nexusIdentityId },
    {
      $setOnInsert: {
        tenantMemberId: `tenant_member_${randomUUID()}`,
        tenantId,
        nexusIdentityId: identity.nexusIdentityId,
        createdAt: now,
      },
      $set: { status: 'active', requireAdminApproval: false, customFields: {}, updatedAt: now },
    },
    { upsert: true },
  );
  await identityCollections.tenantUserRoles.updateOne(
    { tenantId, nexusIdentityId: identity.nexusIdentityId, role: 'owner' },
    {
      $setOnInsert: {
        tenantUserRoleId: `tenant_role_${tenantId}_${identity.nexusIdentityId}_owner`,
        tenantId,
        nexusIdentityId: identity.nexusIdentityId,
        role: 'owner',
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true },
  );
  await tenantCollections.domainTenants.updateOne(
    { tenantId },
    {
      $set: {
        ownerAssignment: {
          email: normalizedEmail,
          identityId: identity.nexusIdentityId,
          assignedByAdminEmail: normalizeEmail(assignedByAdminEmail),
          assignedAt: now,
          activatedAt: null,
        },
        updatedAt: now,
      },
    },
  );

  // Best-effort notification (the email service logs failures, never throws).
  await sendOrgOwnerAssignedEmail(normalizedEmail, tenant.organizationName, language);

  const doc = await tenantCollections.domainTenants.findOne({ tenantId });
  return toRow(doc as unknown as AdminOrgTenantDoc);
}

/**
 * Removes the assigned owner while they never logged in (typo window).
 * Deletes the owner's membership + role rows and clears the assignment so a
 * different email can be assigned.
 * Input: adminCreated tenantId. Output: updated AdminOrganizationRow.
 * Throws: 404 when no assignment exists; 409 owner_already_active after the
 * owner's first sign-in (ownership changes are then out of scope).
 */
export async function removeOrganizationOwner(tenantId: string): Promise<AdminOrganizationRow> {
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const identityCollections = getIdentityDomainCollections(db);

  const tenant = await tenantCollections.domainTenants.findOne({ tenantId });
  const assignment = tenant?.ownerAssignment ?? null;
  if (!tenant?.adminCreated || !assignment) {
    throw createError('Organization or assignment not found', 404);
  }
  if (assignment.activatedAt) {
    throw Object.assign(
      createError('The assigned admin already signed in; ownership can no longer be removed here', 409),
      { code: 'owner_already_active' },
    );
  }

  await Promise.all([
    tenantCollections.tenantMembers.deleteOne({ tenantId, nexusIdentityId: assignment.identityId }),
    identityCollections.tenantUserRoles.deleteMany({ tenantId, nexusIdentityId: assignment.identityId }),
    tenantCollections.domainTenants.updateOne(
      { tenantId },
      { $unset: { ownerAssignment: '' }, $set: { updatedAt: new Date() } },
    ),
  ]);

  const doc = await tenantCollections.domainTenants.findOne({ tenantId });
  return toRow(doc as unknown as AdminOrgTenantDoc);
}
