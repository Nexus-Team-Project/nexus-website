/**
 * Auto-adoption of ADMIN OFFERS (offers a NEXUS platform admin uploaded on
 * behalf of a tenant: uploadedByIdentityId set, visibility 'ecosystem',
 * status 'active', not deleted) into tenant catalogs.
 *
 * Three entry points:
 *   - autoAdoptOfferForAllTenants: fan-out for ONE new/newly-ecosystem admin
 *     offer to every eligible tenant (create + visibility-flip triggers).
 *   - autoAdoptAdminOffersForTenant: catch-up for ONE tenant (catalog
 *     activation + toggle-enable triggers + backfill script).
 *   - setAutoAdoptAdminOffers: the Settings toggle (enable also catches up).
 *
 * Eligible tenant = ACTIVE benefits_catalog TenantServiceActivation AND
 * Tenant.autoAdoptAdminOffers !== false (absent = true).
 *
 * SAFETY INVARIANT: every write here is an upsert whose update carries ONLY
 * $setOnInsert, so an existing TenantOfferConfig row of ANY status is never
 * modified - a tenant's explicit 'excluded' (cancelled adoption) and any
 * manual adoption metadata are permanently respected.
 */
import { randomUUID } from 'node:crypto';
import type { AnyBulkWriteOperation } from 'mongodb';
import { getMongoDb } from '../config/mongo';
import {
  getSupplyDomainCollections,
  NOT_DELETED,
  type NexusOffer,
  type TenantOfferConfig,
} from '../models/domain/supply.models';
import { getTenantDomainCollections } from '../models/domain';
import { computeTenantDisplayPrice } from './supply-price.helper';

/** Mongo filter selecting admin offers (see file doc). */
const ADMIN_OFFER_FILTER = {
  uploadedByIdentityId: { $exists: true },
  visibility: 'ecosystem' as const,
  status: 'active' as const,
  ...NOT_DELETED,
};

/**
 * Resolves the tenantIds eligible for auto-adoption: active benefits_catalog
 * activation joined with autoAdoptAdminOffers !== false (absent = true).
 */
async function findEligibleTenantIds(): Promise<string[]> {
  const db = await getMongoDb();
  const collections = getTenantDomainCollections(db);
  const activations = await collections.tenantServiceActivations
    .find({ serviceKey: 'benefits_catalog', status: 'active' }, { projection: { tenantId: 1 } })
    .toArray();
  const activeIds = activations.map((a) => a.tenantId);
  if (activeIds.length === 0) return [];
  const tenants = await collections.domainTenants
    .find(
      { tenantId: { $in: activeIds }, autoAdoptAdminOffers: { $ne: false } },
      { projection: { tenantId: 1 } },
    )
    .toArray();
  return tenants.map((t) => t.tenantId);
}

/**
 * Builds one $setOnInsert-only upsert op adopting `offer` for `tenantId`.
 * Price seeding mirrors catalog.service adoptOffer: memberPrice = the offer's
 * base member_price, displayPrice via computeTenantDisplayPrice - so an
 * auto-adopted row is indistinguishable from a manual adoption price-wise.
 */
function buildAdoptOp(
  tenantId: string,
  offer: NexusOffer,
  now: Date,
): AnyBulkWriteOperation<TenantOfferConfig> {
  const memberPrice = offer.member_price;
  const displayPrice = computeTenantDisplayPrice(
    offer.executionType,
    memberPrice,
    offer.displayPrice,
    offer.member_price,
    offer.market_price,
  );
  return {
    updateOne: {
      filter: { tenantId, offerId: offer.offerId },
      update: {
        $setOnInsert: {
          configId: randomUUID(),
          tenantId,
          offerId: offer.offerId,
          adoptionStatus: 'active',
          adoptedAt: now,
          // Audit: the acting admin caused this adoption.
          adoptedByIdentityId: offer.uploadedByIdentityId ?? 'nexus_admin',
          ...(memberPrice !== undefined && { memberPrice }),
          ...(displayPrice !== undefined && { displayPrice }),
        },
      },
      upsert: true,
    },
  };
}

/**
 * Fan-out: adopts ONE admin offer for every eligible tenant. Re-verifies the
 * offer matches the admin-offer definition (callers are not trusted). Returns
 * the number of NEW adoption rows inserted (existing rows are never touched).
 */
export async function autoAdoptOfferForAllTenants(offerId: string): Promise<number> {
  const db = await getMongoDb();
  const { nexusOffers, tenantOfferConfigs } = getSupplyDomainCollections(db);
  const offer = await nexusOffers.findOne({ offerId, ...ADMIN_OFFER_FILTER });
  if (!offer) return 0;

  const tenantIds = await findEligibleTenantIds();
  if (tenantIds.length === 0) return 0;

  const now = new Date();
  const result = await tenantOfferConfigs.bulkWrite(
    tenantIds.map((tenantId) => buildAdoptOp(tenantId, offer, now)),
    { ordered: false },
  );
  return result.upsertedCount;
}

/**
 * Catch-up: adopts every admin offer this tenant has NO TenantOfferConfig row
 * for (any-status rows - including 'excluded' - are skipped, so explicit
 * cancellations are never resurrected). Returns { adoptedCount }. Ineligible
 * tenant (no active catalog service or opted out) -> { adoptedCount: 0 }.
 * opts.dryRun counts the would-be adoptions without writing (backfill report).
 */
export async function autoAdoptAdminOffersForTenant(
  tenantId: string,
  opts: { dryRun?: boolean } = {},
): Promise<{ adoptedCount: number }> {
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);

  const activation = await tenantCollections.tenantServiceActivations.findOne(
    { tenantId, serviceKey: 'benefits_catalog', status: 'active' },
    { projection: { _id: 1 } },
  );
  if (!activation) return { adoptedCount: 0 };
  const tenant = await tenantCollections.domainTenants.findOne(
    { tenantId, autoAdoptAdminOffers: { $ne: false } },
    { projection: { _id: 1 } },
  );
  if (!tenant) return { adoptedCount: 0 };

  const { nexusOffers, tenantOfferConfigs } = getSupplyDomainCollections(db);
  const adminOffers = await nexusOffers.find(ADMIN_OFFER_FILTER).toArray();
  if (adminOffers.length === 0) return { adoptedCount: 0 };

  const existing = await tenantOfferConfigs
    .find({ tenantId }, { projection: { offerId: 1 } })
    .toArray();
  const existingIds = new Set(existing.map((c) => c.offerId));
  const missing = adminOffers.filter((o) => !existingIds.has(o.offerId));
  if (missing.length === 0) return { adoptedCount: 0 };
  if (opts.dryRun) return { adoptedCount: missing.length };

  const now = new Date();
  const result = await tenantOfferConfigs.bulkWrite(
    missing.map((offer) => buildAdoptOp(tenantId, offer, now)),
    { ordered: false },
  );
  return { adoptedCount: result.upsertedCount };
}

/**
 * The Settings toggle. Persists Tenant.autoAdoptAdminOffers; enabling also
 * runs the catch-up so offers uploaded while the toggle was off are adopted.
 * Returns { adoptedCount } (always 0 on disable). Idempotent - safe to retry
 * (the flag is set BEFORE the catch-up, so a failed catch-up can be retried
 * by toggling again or via the next activation).
 */
export async function setAutoAdoptAdminOffers(
  tenantId: string,
  enabled: boolean,
): Promise<{ adoptedCount: number }> {
  const db = await getMongoDb();
  await getTenantDomainCollections(db).domainTenants.updateOne(
    { tenantId },
    { $set: { autoAdoptAdminOffers: enabled, updatedAt: new Date() } },
  );
  if (!enabled) return { adoptedCount: 0 };
  return autoAdoptAdminOffersForTenant(tenantId);
}
