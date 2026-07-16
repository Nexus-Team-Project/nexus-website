/**
 * Trigger test: a platform-admin visibility flip tenant_only -> ecosystem on an
 * ADMIN offer (uploadedByIdentityId set) fires the auto-adopt fan-out; the same
 * flip on a regular tenant offer does not, and a non-visibility edit does not.
 * The auto-adopt service is mocked - fan-out behavior itself is covered by
 * admin-offer-auto-adopt.service.test.ts.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/admin-offer-auto-adopt.service', () => ({
  autoAdoptOfferForAllTenants: vi.fn(async () => 0),
  autoAdoptAdminOffersForTenant: vi.fn(async () => ({ adoptedCount: 0 })),
  setAutoAdoptAdminOffers: vi.fn(async () => ({ adoptedCount: 0 })),
}));

import { updateOffer } from '../../src/services/supply.service';
import { autoAdoptOfferForAllTenants } from '../../src/services/admin-offer-auto-adopt.service';
import { getSupplyDomainCollections } from '../../src/models/domain/supply.models';

let client: MongoClient;

/** Insert a minimal non-voucher tenant_only offer; override fields as needed. */
async function seedOffer(offerId: string, fields: Record<string, unknown> = {}): Promise<void> {
  await getSupplyDomainCollections(db).nexusOffers.insertOne({
    offerId, title: offerId, createdByTenantId: 'tenant_owner', createdByIdentityId: 'id_owner',
    visibility: 'tenant_only', invitedByTenantId: 'tenant_owner', status: 'active', deletedAt: null,
    executionType: 'coupon', member_price: 50,
    createdAt: new Date(), updatedAt: new Date(), ...fields,
  } as never);
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db('admin_offer_auto_adopt_triggers_test');
});
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  vi.clearAllMocks();
  await getSupplyDomainCollections(db).nexusOffers.deleteMany({});
  await getSupplyDomainCollections(db).tenantOfferConfigs.deleteMany({});
});

describe('updateOffer visibility-flip trigger', () => {
  it('fires the fan-out when an ADMIN offer flips to ecosystem', async () => {
    await seedOffer('o_admin', { uploadedByIdentityId: 'id_admin' });
    const result = await updateOffer('o_admin', 'tenant_admin_ctx', { visibility: 'ecosystem' }, true);
    expect(result).not.toBeNull();
    expect(autoAdoptOfferForAllTenants).toHaveBeenCalledWith('o_admin');
  });

  it('does NOT fire for a regular tenant offer flipped to ecosystem', async () => {
    await seedOffer('o_regular');
    const result = await updateOffer('o_regular', 'tenant_admin_ctx', { visibility: 'ecosystem' }, true);
    expect(result).not.toBeNull();
    expect(autoAdoptOfferForAllTenants).not.toHaveBeenCalled();
  });

  it('does NOT fire on a non-visibility edit of an admin offer', async () => {
    await seedOffer('o_admin2', { uploadedByIdentityId: 'id_admin', visibility: 'ecosystem' });
    const result = await updateOffer('o_admin2', 'tenant_admin_ctx', { title: 'new title' }, true);
    expect(result).not.toBeNull();
    expect(autoAdoptOfferForAllTenants).not.toHaveBeenCalled();
  });
});
