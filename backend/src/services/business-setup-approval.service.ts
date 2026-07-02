/**
 * M8 business-setup approval service: list tenants pending NEXUS-admin approval
 * (with their submitted details for review), approve, deny (free-text reason),
 * count, and the gate resolver used by the publish + go-live routes.
 *
 * Platform-admin gating is enforced at the route layer. The tenant owner's email
 * is resolved server-side from the tenant's createdByIdentityId - never trusted
 * from the client. The denial reason is stored + emailed as plain text.
 */
import { ObjectId } from 'mongodb';
import { getMongoDb } from '../config/mongo';
import { getTenantDomainCollections, getIdentityDomainCollections } from '../models/domain';
import { getOnboardingCollections } from '../models/onboarding.models';
import { createError } from '../middleware/errorHandler';
import { sendBusinessSetupApproved, sendBusinessSetupDenied } from './business-setup-approval-email.service';

/** A pending tenant row for the admin business-setup approvals page. */
export interface BusinessSetupApprovalRow {
  tenantId: string;
  organizationName: string;
  logoUrl?: string;
  brandColor?: string;
  devMode: boolean;
  submittedAt?: Date;
  /** The submitted business-setup form data (read-only review). Null if none stored. */
  details: Record<string, unknown> | null;
}

/** Mongo dot-path for the approval status. */
const STATUS_PATH = 'businessSetupApproval.status';

/**
 * List tenants whose business setup is pending admin approval, paginated, each
 * with its submitted details. Oldest submission first.
 * Input: page + limit. Output: { items, total }.
 */
export async function listPendingBusinessSetups(
  opts: { page: number; limit: number },
): Promise<{ items: BusinessSetupApprovalRow[]; total: number }> {
  const db = await getMongoDb();
  const { domainTenants } = getTenantDomainCollections(db);
  const { businessSetups } = getOnboardingCollections(db);
  const filter = { [STATUS_PATH]: 'pending' };
  const total = await domainTenants.countDocuments(filter);
  const docs = await domainTenants
    .find(filter, { projection: { tenantId: 1, organizationName: 1, logoUrl: 1, brandColor: 1, businessSetupApproval: 1 } })
    .sort({ 'businessSetupApproval.submittedAt': 1 })
    .skip((opts.page - 1) * opts.limit)
    .limit(opts.limit)
    .toArray();

  // Batch-load submitted details from the legacy businessSetups collection,
  // keyed by ObjectId(domain tenantId) (= the legacy tenant _id).
  const objIds = docs.map((d) => new ObjectId(d.tenantId));
  const setups = objIds.length
    ? await businessSetups.find({ tenantId: { $in: objIds } }).toArray()
    : [];
  const detailMap = new Map(setups.map((s) => [String(s.tenantId), s.data as Record<string, unknown>]));

  const items: BusinessSetupApprovalRow[] = docs.map((d) => ({
    tenantId: d.tenantId,
    organizationName: d.organizationName,
    ...(d.logoUrl ? { logoUrl: d.logoUrl } : {}),
    ...(d.brandColor ? { brandColor: d.brandColor } : {}),
    devMode: d.businessSetupApproval?.devMode === true,
    ...(d.businessSetupApproval?.submittedAt ? { submittedAt: d.businessSetupApproval.submittedAt } : {}),
    details: detailMap.get(d.tenantId) ?? null,
  }));
  return { items, total };
}

/** Count tenants pending business-setup approval (for the sidebar badge). */
export async function countPendingBusinessSetups(): Promise<number> {
  const db = await getMongoDb();
  return getTenantDomainCollections(db).domainTenants.countDocuments({ [STATUS_PATH]: 'pending' });
}

/** True when this tenant's business setup is approved. Used by the publish + go-live gates. */
export async function isTenantBusinessSetupApproved(tenantId: string): Promise<boolean> {
  const db = await getMongoDb();
  const t = await getTenantDomainCollections(db).domainTenants.findOne(
    { tenantId }, { projection: { businessSetupApproval: 1 } },
  );
  return t?.businessSetupApproval?.status === 'approved';
}

/** Resolves the tenant owner's email + org name from the tenant creator identity. */
async function ownerContact(
  db: Awaited<ReturnType<typeof getMongoDb>>,
  tenantId: string,
): Promise<{ email: string | null; name: string }> {
  const tenant = await getTenantDomainCollections(db).domainTenants.findOne({ tenantId });
  if (!tenant) throw createError('tenant_not_found', 404);
  const identity = await getIdentityDomainCollections(db).nexusIdentities.findOne({ nexusIdentityId: tenant.createdByIdentityId });
  return { email: identity?.normalizedEmail ?? null, name: tenant.organizationName ?? tenantId };
}

/**
 * Approve a pending tenant's business setup + email the owner.
 * Throws 404 when the tenant does not exist or is not pending.
 */
export async function approveBusinessSetup(tenantId: string, adminEmail: string): Promise<void> {
  const db = await getMongoDb();
  const res = await getTenantDomainCollections(db).domainTenants.updateOne(
    { tenantId, [STATUS_PATH]: 'pending' },
    {
      $set: {
        [STATUS_PATH]: 'approved',
        'businessSetupApproval.reviewedByEmail': adminEmail,
        'businessSetupApproval.reviewedAt': new Date(),
        updatedAt: new Date(),
      },
      $unset: { 'businessSetupApproval.reason': '' },
    },
  );
  if (res.matchedCount === 0) throw createError('tenant_not_found', 404);
  const { email, name } = await ownerContact(db, tenantId);
  if (email) void sendBusinessSetupApproved(email, name);
}

/**
 * Deny a pending tenant's business setup with a free-text reason + email the owner.
 * Throws 404 when the tenant does not exist or is not pending.
 */
export async function denyBusinessSetup(tenantId: string, reason: string, adminEmail: string): Promise<void> {
  const db = await getMongoDb();
  const res = await getTenantDomainCollections(db).domainTenants.updateOne(
    { tenantId, [STATUS_PATH]: 'pending' },
    {
      $set: {
        [STATUS_PATH]: 'denied',
        'businessSetupApproval.reason': reason,
        'businessSetupApproval.reviewedByEmail': adminEmail,
        'businessSetupApproval.reviewedAt': new Date(),
        updatedAt: new Date(),
      },
    },
  );
  if (res.matchedCount === 0) throw createError('tenant_not_found', 404);
  const { email, name } = await ownerContact(db, tenantId);
  if (email) void sendBusinessSetupDenied(email, name, reason);
}
