/**
 * Behavioral tests for the trusted-tenants service (admin-tenants.service):
 *   - listAllTenants: pagination, per-tenant pending-offer counts, org-name
 *     search, and the production `businessSetupPassedOnly` filter (which joins
 *     the legacy onboarding tenants by their _id == domain tenantId).
 *   - setTenantAutoApprove: enabling flips the flag, retroactively approves the
 *     tenant's pending offers to 'active', returns their ids, and emails the org
 *     admin; disabling only flips the flag; an unknown tenant throws 404.
 *   - isTenantAutoApprove: reflects the stored flag.
 *
 * Uses the in-memory Mongo from tests/setup. getMongoDb is pointed at the test
 * db; the email services are mocked so no mail is sent and the org-approved call
 * can be asserted.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
// The service (and approveOffer it calls) reach Mongo via getMongoDb().
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
// Do not send real email; let the org-approved call be asserted.
vi.mock('../../src/services/org-approval-email.service', () => ({ sendOrgApprovedEmail: vi.fn(async () => {}) }));
vi.mock('../../src/services/voucher-approval-email.service', () => ({ sendVoucherApprovedEmail: vi.fn(async () => {}) }));

import { listAllTenants, setTenantAutoApprove, isTenantAutoApprove } from '../../src/services/admin-tenants.service';
import { sendOrgApprovedEmail } from '../../src/services/org-approval-email.service';
import { getTenantDomainCollections, getIdentityDomainCollections } from '../../src/models/domain';
import { getSupplyDomainCollections } from '../../src/models/domain/supply.models';
import { getOnboardingCollections } from '../../src/models/onboarding.models';

let client: MongoClient;

/**
 * Insert a minimal domain tenant (raw, no Zod). Defaults to business-setup
 * APPROVED so it appears in listAllTenants (which is approved-only, M8);
 * pass `businessSetupApproval` to override.
 */
async function seedTenant(fields: Record<string, unknown>): Promise<void> {
  await getTenantDomainCollections(db).domainTenants.insertOne({
    status: 'build_mode', autoApproveOffers: false, businessSetupApproval: { status: 'approved' },
    createdAt: new Date(), updatedAt: new Date(), ...fields,
  } as never);
}

/** Insert a pending ecosystem offer for a tenant. */
async function seedPendingOffer(offerId: string, tenantId: string): Promise<void> {
  await getSupplyDomainCollections(db).nexusOffers.insertOne({
    offerId, createdByTenantId: tenantId, createdByIdentityId: 'id_a', title: offerId,
    status: 'pending_approval', deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  } as never);
}

/** Read an offer's current status. */
async function offerStatus(offerId: string): Promise<string | undefined> {
  const o = await getSupplyDomainCollections(db).nexusOffers.findOne({ offerId });
  return o?.status as string | undefined;
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_admin_tenants_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await getTenantDomainCollections(db).domainTenants.deleteMany({});
  await getSupplyDomainCollections(db).nexusOffers.deleteMany({});
  await getIdentityDomainCollections(db).nexusIdentities.deleteMany({});
  await getOnboardingCollections(db).tenants.deleteMany({});
});

describe('listAllTenants', () => {
  it('paginates and reports the total across all matches', async () => {
    for (let i = 0; i < 5; i++) await seedTenant({ tenantId: `t${i}`, organizationName: `Org ${i}` });
    const p1 = await listAllTenants({ page: 1, limit: 2 });
    expect(p1.total).toBe(5);
    expect(p1.tenants).toHaveLength(2);
    const p3 = await listAllTenants({ page: 3, limit: 2 });
    expect(p3.tenants).toHaveLength(1); // 5 = 2 + 2 + 1
  });

  it('counts each tenant pending offers', async () => {
    await seedTenant({ tenantId: 'tA', organizationName: 'Acme' });
    await seedTenant({ tenantId: 'tB', organizationName: 'Beta' });
    await seedPendingOffer('o1', 'tA');
    await seedPendingOffer('o2', 'tA');
    const { tenants } = await listAllTenants({ page: 1, limit: 10 });
    expect(tenants.find((t) => t.tenantId === 'tA')?.pendingOfferCount).toBe(2);
    expect(tenants.find((t) => t.tenantId === 'tB')?.pendingOfferCount).toBe(0);
  });

  it('filters by organization-name search (case-insensitive)', async () => {
    await seedTenant({ tenantId: 'tA', organizationName: 'Acme Foods' });
    await seedTenant({ tenantId: 'tB', organizationName: 'Beta Corp' });
    const { tenants, total } = await listAllTenants({ page: 1, limit: 10, search: 'acme' });
    expect(total).toBe(1);
    expect(tenants[0].organizationName).toBe('Acme Foods');
  });

  it('returns ONLY business-setup-approved tenants (dev + prod)', async () => {
    await seedTenant({ tenantId: 'ap', organizationName: 'Approved', businessSetupApproval: { status: 'approved' } });
    await seedTenant({ tenantId: 'pe', organizationName: 'Pending', businessSetupApproval: { status: 'pending' } });
    await seedTenant({ tenantId: 'de', organizationName: 'Denied', businessSetupApproval: { status: 'denied' } });
    await seedTenant({ tenantId: 'no', organizationName: 'NoneYet', businessSetupApproval: undefined });
    const { tenants, total } = await listAllTenants({ page: 1, limit: 10 });
    expect(total).toBe(1);
    expect(tenants.map((t) => t.organizationName)).toEqual(['Approved']);
  });
});

describe('setTenantAutoApprove', () => {
  it('enabling flips the flag, approves pending offers, and emails the org admin', async () => {
    await getIdentityDomainCollections(db).nexusIdentities.insertOne({ nexusIdentityId: 'id_a', normalizedEmail: 'admin@acme.com' } as never);
    await seedTenant({ tenantId: 'tA', organizationName: 'Acme', createdByIdentityId: 'id_a' });
    await seedPendingOffer('o1', 'tA');
    await seedPendingOffer('o2', 'tA');

    const res = await setTenantAutoApprove('tA', true, 'he');

    expect(res.approvedOfferIds.sort()).toEqual(['o1', 'o2']);
    expect(await offerStatus('o1')).toBe('active');
    expect(await offerStatus('o2')).toBe('active');
    expect(await isTenantAutoApprove('tA')).toBe(true);
    // Org admin is notified in the requested language.
    expect(sendOrgApprovedEmail).toHaveBeenCalledWith('admin@acme.com', 'Acme', 'he');
  });

  it('disabling only flips the flag and approves nothing', async () => {
    await seedTenant({ tenantId: 'tA', organizationName: 'Acme', autoApproveOffers: true });
    await seedPendingOffer('o1', 'tA');

    const res = await setTenantAutoApprove('tA', false, 'en');

    expect(res.approvedOfferIds).toEqual([]);
    expect(await offerStatus('o1')).toBe('pending_approval');
    expect(await isTenantAutoApprove('tA')).toBe(false);
    expect(sendOrgApprovedEmail).not.toHaveBeenCalled();
  });

  it('throws 404 for an unknown tenant', async () => {
    await expect(setTenantAutoApprove('missing', true, 'he')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('isTenantAutoApprove', () => {
  it('is true only when the flag is set', async () => {
    await seedTenant({ tenantId: 'tOn', organizationName: 'On', autoApproveOffers: true });
    await seedTenant({ tenantId: 'tOff', organizationName: 'Off', autoApproveOffers: false });
    await seedTenant({ tenantId: 'tMissing', organizationName: 'Missing' }); // seedTenant defaults false
    expect(await isTenantAutoApprove('tOn')).toBe(true);
    expect(await isTenantAutoApprove('tOff')).toBe(false);
    expect(await isTenantAutoApprove('tMissing')).toBe(false);
    expect(await isTenantAutoApprove('nope')).toBe(false);
  });
});
