/**
 * Tests for the tenant cover-gallery service: reconcile stores the submitted
 * order, drops orphaned Cloudinary assets (and ONLY those), enforces the
 * 5-image cap, unsets on empty, and clear-all deletes every asset.
 *
 * Uses the in-memory Mongo from tests/setup; Cloudinary is mocked so no
 * network is touched and deletions can be asserted.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

const deleteOfferImageMock = vi.fn(async () => undefined);
vi.mock('../../src/utils/cloudinary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/cloudinary')>()),
  deleteOfferImage: (url: string) => deleteOfferImageMock(url),
}));

import { setTenantCovers, clearTenantCovers } from '../../src/services/tenant-cover.service';
import { getTenantDomainCollections } from '../../src/models/domain';
import type { TenantCoverImage } from '../../src/models/domain/tenant.models';

let client: MongoClient;
let db: Db;
const TENANT = 't_cover';

/** Shorthand entry factory (Cloudinary-shaped URLs). */
function entry(name: string, crop: TenantCoverImage['crop'] = null): TenantCoverImage {
  return { url: `https://res.cloudinary.com/demo/image/upload/nexus/tenant-covers/${name}.jpg`, crop };
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`tenant_cover_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  deleteOfferImageMock.mockClear();
  const { domainTenants } = getTenantDomainCollections(db);
  await domainTenants.deleteMany({});
  await domainTenants.insertOne({
    tenantId: TENANT, organizationName: 'Cover Co', status: 'active', plan: 'basic',
    createdByIdentityId: 'id_1', createdAt: new Date(), updatedAt: new Date(),
  } as never);
});

/** Read the stored cover set. */
async function storedCovers(): Promise<TenantCoverImage[] | undefined> {
  const doc = await getTenantDomainCollections(db).domainTenants.findOne({ tenantId: TENANT });
  return doc?.coverImages as TenantCoverImage[] | undefined;
}

describe('setTenantCovers', () => {
  it('stores the submitted order and deletes only dropped assets', async () => {
    const [a, b, c] = [entry('a'), entry('b'), entry('c')];
    await setTenantCovers(db, { tenantId: TENANT, entries: [a, b, c] });
    expect((await storedCovers())?.map((e) => e.url)).toEqual([a.url, b.url, c.url]);
    expect(deleteOfferImageMock).not.toHaveBeenCalled();

    // Reorder + drop b: b's asset is deleted; a and c stay.
    await setTenantCovers(db, { tenantId: TENANT, entries: [c, a] });
    expect((await storedCovers())?.map((e) => e.url)).toEqual([c.url, a.url]);
    expect(deleteOfferImageMock).toHaveBeenCalledTimes(1);
    expect(deleteOfferImageMock).toHaveBeenCalledWith(b.url);
  });

  it('crop-only change keeps the asset (no deletion)', async () => {
    const a = entry('a');
    await setTenantCovers(db, { tenantId: TENANT, entries: [a] });
    const cropped = entry('a', { x: 0.1, y: 0.1, width: 0.8, height: 0.5 });
    await setTenantCovers(db, { tenantId: TENANT, entries: [cropped] });
    expect((await storedCovers())?.[0]?.crop).toEqual(cropped.crop);
    expect(deleteOfferImageMock).not.toHaveBeenCalled();
  });

  it('rejects more than the cap', async () => {
    const entries = Array.from({ length: 6 }, (_, i) => entry(`x${i}`));
    await expect(setTenantCovers(db, { tenantId: TENANT, entries })).rejects.toMatchObject({ status: 400 });
  });

  it('an empty set unsets the field and deletes prior assets', async () => {
    const a = entry('a');
    await setTenantCovers(db, { tenantId: TENANT, entries: [a] });
    await setTenantCovers(db, { tenantId: TENANT, entries: [] });
    expect(await storedCovers()).toBeUndefined();
    expect(deleteOfferImageMock).toHaveBeenCalledWith(a.url);
  });
});

describe('clearTenantCovers', () => {
  it('clears the whole set and deletes every asset', async () => {
    const [a, b] = [entry('a'), entry('b')];
    await setTenantCovers(db, { tenantId: TENANT, entries: [a, b] });
    deleteOfferImageMock.mockClear();
    await clearTenantCovers(db, { tenantId: TENANT });
    expect(await storedCovers()).toBeUndefined();
    expect(deleteOfferImageMock).toHaveBeenCalledTimes(2);
    expect(deleteOfferImageMock).toHaveBeenCalledWith(a.url);
    expect(deleteOfferImageMock).toHaveBeenCalledWith(b.url);
  });
});
