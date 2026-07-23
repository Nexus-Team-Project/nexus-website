/**
 * Post-onboarding tenant identity editing (name, description, website, phone).
 * These four fields are captured once at workspace creation and, before this
 * service, had no edit path. The legacy `tenants` document (onboarding.models.ts)
 * is the actual source of truth that domain-tenant-sync's syncDomainTenantCoreDocs
 * mirrors FROM on every /api/me call - so every write here goes through the
 * legacy document FIRST, then immediately refreshes the domainTenants /
 * tenantProfiles mirrors, or the next /api/me call would silently revert the
 * edit back to the pre-edit value.
 */
import { Db, ObjectId } from 'mongodb';
import { getOnboardingCollections } from '../models/onboarding.models';
import { syncDomainTenantCoreDocs } from './domain-tenant-sync.service';

export interface TenantIdentityUpdate {
  tenantId: string;
  /** Caller's NexusIdentity id - only used for the domainTenants $setOnInsert
   *  branch, which never fires here since the tenant already exists. */
  callerIdentityId: string;
  organizationName?: string;
  businessDescription?: string;
  website?: string;
  contactPhone?: string;
}

export interface TenantIdentityView {
  organizationName: string;
  businessDescription: string;
  website: string;
  contactPhone: string;
}

/**
 * Applies a partial identity update to a tenant: writes the legacy `tenants`
 * document (the real source of truth), then re-runs the existing domain sync
 * so domainTenants/tenantProfiles reflect the change immediately.
 * @throws { status: 404 } when the tenant does not exist.
 */
export async function updateTenantIdentity(
  db: Db,
  args: TenantIdentityUpdate,
): Promise<TenantIdentityView> {
  const { tenants } = getOnboardingCollections(db);
  const objectId = new ObjectId(args.tenantId);

  const setFields: Record<string, string> = {};
  if (args.organizationName !== undefined) setFields.organizationName = args.organizationName;
  if (args.businessDescription !== undefined) setFields.businessDescription = args.businessDescription;
  if (args.website !== undefined) setFields.website = args.website;
  if (args.contactPhone !== undefined) setFields.contactPhone = args.contactPhone;

  if (Object.keys(setFields).length > 0) {
    await tenants.updateOne({ _id: objectId }, { $set: { ...setFields, updatedAt: new Date() } });
  }

  const tenant = await tenants.findOne({ _id: objectId });
  if (!tenant) throw Object.assign(new Error('tenant_not_found'), { status: 404 });

  await syncDomainTenantCoreDocs({
    tenantId: objectId,
    tenant,
    createdByIdentityId: args.callerIdentityId,
  });

  return {
    organizationName: tenant.organizationName,
    businessDescription: tenant.businessDescription,
    website: tenant.website,
    contactPhone: tenant.contactPhone,
  };
}
