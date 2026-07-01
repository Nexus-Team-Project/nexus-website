/**
 * Platform-admin trusted-tenants service: list all tenants (with a pending-offer
 * count) and toggle a tenant's autoApproveOffers trust. Enabling trust retroactively
 * approves that tenant's pending offers and emails the supplier. Platform-admin gating
 * is enforced at the route layer.
 */
import { getMongoDb } from '../config/mongo';
import { getTenantDomainCollections, getIdentityDomainCollections } from '../models/domain';
import { getOnboardingCollections } from '../models/onboarding.models';
import { getSupplyDomainCollections, NOT_DELETED, type NexusOffer } from '../models/domain/supply.models';
import { createError } from '../middleware/errorHandler';
import { approveOffer } from './supply-approval.service';
import { sendVoucherApprovedEmail } from './voucher-approval-email.service';
import { sendOrgApprovedEmail, type EmailLanguage } from './org-approval-email.service';

export interface AdminTenantRow {
  tenantId: string;
  organizationName: string;
  logoUrl?: string;
  brandColor?: string;
  status: string;
  autoApproveOffers: boolean;
  pendingOfferCount: number;
}

interface TenantDocLike {
  tenantId: string;
  organizationName: string;
  status: string;
  logoUrl?: string;
  brandColor?: string;
  autoApproveOffers?: boolean;
}

/** Pure: map a tenant doc + its pending count to the admin row shape. */
export function toAdminTenantRow(t: TenantDocLike, pendingOfferCount: number): AdminTenantRow {
  return {
    tenantId: t.tenantId,
    organizationName: t.organizationName,
    ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
    ...(t.brandColor ? { brandColor: t.brandColor } : {}),
    status: t.status,
    autoApproveOffers: t.autoApproveOffers === true,
    pendingOfferCount,
  };
}

/** True when the tenant is trusted (autoApproveOffers). Used by the create/edit flow. */
export async function isTenantAutoApprove(tenantId: string): Promise<boolean> {
  const db = await getMongoDb();
  const { domainTenants } = getTenantDomainCollections(db);
  const t = await domainTenants.findOne({ tenantId }, { projection: { autoApproveOffers: 1 } });
  return t?.autoApproveOffers === true;
}

/**
 * Resolves the set of tenantIds that have SUBMITTED business setup.
 * Domain tenantId === the legacy onboarding tenant's _id (hex), so this reads
 * the legacy onboarding tenants whose businessSetupStatus reached 'submitted'
 * (or 'approved') and returns their hex ids. Used to scope the trusted-tenants
 * list in production to organizations past business setup.
 */
async function businessSetupPassedTenantIds(db: Awaited<ReturnType<typeof getMongoDb>>): Promise<string[]> {
  const { tenants } = getOnboardingCollections(db);
  const docs = await tenants
    .find({ businessSetupStatus: { $in: ['submitted', 'approved'] } }, { projection: { _id: 1 } })
    .toArray();
  return docs.map((d) => d._id.toHexString());
}

/**
 * List tenants (paginated, org-name search) with a pending-offer count each.
 * When `businessSetupPassedOnly` is set (production), only organizations that
 * have submitted business setup are returned; in development every tenant is
 * listed. The exact production audience is refined in a later milestone.
 */
export async function listAllTenants(
  opts: { search?: string; page: number; limit: number; businessSetupPassedOnly?: boolean },
): Promise<{ tenants: AdminTenantRow[]; total: number }> {
  const db = await getMongoDb();
  const { domainTenants } = getTenantDomainCollections(db);
  const { nexusOffers } = getSupplyDomainCollections(db);
  const filter: Record<string, unknown> = opts.search
    ? { organizationName: { $regex: opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
    : {};
  if (opts.businessSetupPassedOnly) {
    const passedIds = await businessSetupPassedTenantIds(db);
    // No tenant past business setup -> empty page (avoids an unbounded $in:[]).
    if (passedIds.length === 0) return { total: 0, tenants: [] };
    filter.tenantId = { $in: passedIds };
  }
  const total = await domainTenants.countDocuments(filter);
  const docs = await domainTenants
    .find(filter, { projection: { tenantId: 1, organizationName: 1, logoUrl: 1, brandColor: 1, status: 1, autoApproveOffers: 1 } })
    .sort({ organizationName: 1 })
    .skip((opts.page - 1) * opts.limit)
    .limit(opts.limit)
    .toArray();
  const ids = docs.map((d) => d.tenantId);
  const counts = ids.length === 0
    ? []
    : await nexusOffers.aggregate<{ _id: string; n: number }>([
        { $match: { createdByTenantId: { $in: ids }, status: 'pending_approval', ...NOT_DELETED } },
        { $group: { _id: '$createdByTenantId', n: { $sum: 1 } } },
      ]).toArray();
  const countMap = new Map(counts.map((c) => [c._id, c.n]));
  return { total, tenants: docs.map((d) => toAdminTenantRow(d as TenantDocLike, countMap.get(d.tenantId) ?? 0)) };
}

/** Best-effort: email the supplier that their offer is now live (retroactive approve). */
async function emailSupplierApproved(offer: NexusOffer): Promise<void> {
  try {
    const db = await getMongoDb();
    const idc = getIdentityDomainCollections(db);
    const tc = getTenantDomainCollections(db);
    const [identity, tenant] = await Promise.all([
      idc.nexusIdentities.findOne({ nexusIdentityId: offer.createdByIdentityId }),
      tc.domainTenants.findOne({ tenantId: offer.createdByTenantId }),
    ]);
    if (identity?.normalizedEmail) {
      const name = tenant?.organizationName ?? offer.createdByTenantId;
      sendVoucherApprovedEmail(identity.normalizedEmail, offer, name).catch(() => { /* logged inside the email service */ });
    }
  } catch (e) {
    console.error('[ADMIN-TENANTS] retro approve email failed:', e);
  }
}

/**
 * Best-effort: email the organization admin that their org is now trusted and
 * may post global offers freely. Recipient = the tenant creator's identity email.
 * Rendered in the sender's dashboard language. Never throws.
 */
async function emailOrgAdminApproved(
  db: Awaited<ReturnType<typeof getMongoDb>>,
  tenantId: string,
  language: EmailLanguage,
): Promise<void> {
  try {
    const tc = getTenantDomainCollections(db);
    const idc = getIdentityDomainCollections(db);
    const tenant = await tc.domainTenants.findOne({ tenantId });
    if (!tenant) return;
    const identity = await idc.nexusIdentities.findOne({ nexusIdentityId: tenant.createdByIdentityId });
    if (identity?.normalizedEmail) {
      const name = tenant.organizationName ?? tenantId;
      void sendOrgApprovedEmail(identity.normalizedEmail, name, language);
    }
  } catch (e) {
    console.error('[ADMIN-TENANTS] org-approved email failed:', e);
  }
}

/**
 * Set a tenant's trust; on enable, retroactively approve its pending offers and
 * email the org admin (in `language`) that the org can now post global offers.
 */
export async function setTenantAutoApprove(
  tenantId: string,
  enabled: boolean,
  language: EmailLanguage = 'he',
): Promise<{ approvedOfferIds: string[] }> {
  const db = await getMongoDb();
  const { domainTenants } = getTenantDomainCollections(db);
  const res = await domainTenants.updateOne(
    { tenantId },
    { $set: { autoApproveOffers: enabled, updatedAt: new Date() } },
  );
  if (res.matchedCount === 0) throw createError('tenant_not_found', 404);

  const approvedOfferIds: string[] = [];
  if (enabled) {
    void emailOrgAdminApproved(db, tenantId, language);
    const { nexusOffers } = getSupplyDomainCollections(db);
    const pending = await nexusOffers
      .find({ createdByTenantId: tenantId, status: 'pending_approval', ...NOT_DELETED })
      .toArray();
    for (const p of pending) {
      const approved = await approveOffer(p.offerId);
      if (approved) {
        approvedOfferIds.push(approved.offerId);
        void emailSupplierApproved(approved);
      }
    }
  }
  return { approvedOfferIds };
}
