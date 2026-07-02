/**
 * Lock tests: an offer a Nexus admin uploaded on behalf of a tenant
 * (uploadedByIdentityId set) is Nexus-managed. The OWNING tenant may not edit,
 * delete, or reprice it; a platform admin still can; adopting tenants keep their
 * own per-tenant price. Enforced in supply.service (delete/update) and
 * tenant-pricing.service (price). Uses the in-memory Mongo from globalSetup.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { deleteOffer, updateOffer } from '../../src/services/supply.service';
import { setTenantVoucherPrice } from '../../src/services/tenant-pricing.service';
import { getSupplyDomainCollections } from '../../src/models/domain/supply.models';

let client: MongoClient;
const OWNER = 'tOwner';
const ADOPTER = 'tAdopter';
const ADMIN_IDENTITY = 'adminIdentity1';

/** Insert a minimal offer document (raw, no Zod). */
async function seedOffer(fields: Record<string, unknown>): Promise<void> {
  await getSupplyDomainCollections(db).nexusOffers.insertOne({
    title: 'Offer', description: '', category: 'other', executionType: 'voucher',
    status: 'active', face_value: 100, member_price: 80, imageUrls: [],
    createdAt: new Date(), updatedAt: new Date(), ...fields,
  } as never);
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_onbehalf_lock_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await getSupplyDomainCollections(db).nexusOffers.deleteMany({});
  // An admin-uploaded offer owned by OWNER, and a normal offer OWNER created itself.
  await seedOffer({ offerId: 'onbehalf', createdByTenantId: OWNER, uploadedByIdentityId: ADMIN_IDENTITY });
  await seedOffer({ offerId: 'self', createdByTenantId: OWNER });
});

describe('deleteOffer respects the on-behalf lock', () => {
  it('the owning tenant cannot delete an admin-uploaded offer (404)', async () => {
    await expect(deleteOffer('onbehalf', OWNER, false)).rejects.toMatchObject({ status: 404 });
  });

  it('the owning tenant can still delete its own self-created offer', async () => {
    const deleted = await deleteOffer('self', OWNER, false);
    expect(deleted.offerId).toBe('self');
  });

  it('a platform admin can delete an admin-uploaded offer', async () => {
    const deleted = await deleteOffer('onbehalf', OWNER, true);
    expect(deleted.offerId).toBe('onbehalf');
  });
});

describe('updateOffer respects the on-behalf lock', () => {
  it('the owning tenant cannot update an admin-uploaded offer (null)', async () => {
    expect(await updateOffer('onbehalf', OWNER, {}, false)).toBeNull();
  });

  it('the owning tenant can still update its own self-created offer', async () => {
    const res = await updateOffer('self', OWNER, {}, false);
    expect(res?.offer.offerId).toBe('self');
  });

  it('a platform admin is not blocked by the lock', async () => {
    // Admin path still requires createdByTenantId match (unchanged), so pass OWNER.
    const res = await updateOffer('onbehalf', OWNER, {}, true);
    expect(res?.offer.offerId).toBe('onbehalf');
  });
});

describe('setTenantVoucherPrice respects the on-behalf lock', () => {
  it('the owning tenant is owner_locked on an admin-uploaded offer', async () => {
    const res = await setTenantVoucherPrice({ tenantId: OWNER, offerId: 'onbehalf', memberPrice: 50 });
    expect(res).toEqual({ ok: false, reason: 'owner_locked' });
  });

  it('an adopting tenant is NOT owner_locked (falls through to adoption checks)', async () => {
    const res = await setTenantVoucherPrice({ tenantId: ADOPTER, offerId: 'onbehalf', memberPrice: 50 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).not.toBe('owner_locked');
  });
});
