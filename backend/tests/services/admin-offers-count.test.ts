/**
 * Test for countPendingApprovalOffers - the platform-wide count of offers
 * awaiting admin approval, powering the admin sidebar badge. It must count only
 * status 'pending_approval' offers that are not soft-deleted.
 *
 * Uses the in-memory Mongo from tests/setup with getMongoDb pointed at it.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { countPendingApprovalOffers } from '../../src/services/supply-approval.service';
import { getSupplyDomainCollections } from '../../src/models/domain/supply.models';

let client: MongoClient;

async function seed(offerId: string, status: string, deletedAt: Date | null = null): Promise<void> {
  await getSupplyDomainCollections(db).nexusOffers.insertOne({
    offerId, status, deletedAt, createdByTenantId: 't', createdAt: new Date(), updatedAt: new Date(),
  } as never);
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_pending_count_${Date.now()}`);
});
afterAll(async () => { await db.dropDatabase(); await client.close(); });
beforeEach(async () => { await getSupplyDomainCollections(db).nexusOffers.deleteMany({}); });

describe('countPendingApprovalOffers', () => {
  it('counts only non-deleted pending_approval offers', async () => {
    await seed('p1', 'pending_approval');
    await seed('p2', 'pending_approval');
    await seed('a1', 'active');
    await seed('d1', 'denied');
    await seed('del', 'pending_approval', new Date()); // soft-deleted -> excluded
    expect(await countPendingApprovalOffers()).toBe(2);
  });

  it('is zero when nothing is pending', async () => {
    await seed('a1', 'active');
    expect(await countPendingApprovalOffers()).toBe(0);
  });
});
