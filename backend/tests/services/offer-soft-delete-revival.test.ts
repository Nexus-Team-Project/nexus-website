/**
 * Regression test for the "deleted offers revive on service re-activation" bug.
 *
 * Soft-delete is recorded on a dedicated `deletedAt` field (orthogonal to the
 * `status` lifecycle). Both delete and service-deactivate set status:'inactive',
 * so the re-activation sweep — which restores inactive offers to active — must
 * additionally filter on NOT_DELETED (`{ deletedAt: null }`) or it would revive
 * deleted offers. These tests assert that filter behaves correctly, including
 * for legacy documents that predate the field (missing `deletedAt`).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';
import { NOT_DELETED } from '../../src/models/domain/supply.models';

let client: MongoClient;
let db: Db;
const TENANT = 'tenant_abc';

/** Inserts a minimal offer doc; raw insert (no Zod) so tests stay terse. */
async function seedOffer(fields: Record<string, unknown>): Promise<void> {
  await db.collection(DOMAIN_COLLECTIONS.nexusOffers).insertOne({
    createdByTenantId: TENANT,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...fields,
  });
}

async function statusOf(offerId: string): Promise<string | undefined> {
  const doc = await db
    .collection(DOMAIN_COLLECTIONS.nexusOffers)
    .findOne({ offerId });
  return doc?.status as string | undefined;
}

beforeAll(async () => {
  client = new MongoClient(process.env.TEST_MONGODB_URI as string);
  await client.connect();
  db = client.db(`offer_soft_delete_${Date.now()}`);
});
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  await db.collection(DOMAIN_COLLECTIONS.nexusOffers).deleteMany({});
});

describe('NOT_DELETED filter', () => {
  it('is the canonical { deletedAt: null } clause', () => {
    expect(NOT_DELETED).toEqual({ deletedAt: null });
  });
});

describe('re-activation sweep excludes soft-deleted offers', () => {
  /** The exact filter the activation service uses to restore offers. */
  const reactivateFilter = {
    createdByTenantId: TENANT,
    status: 'inactive',
    ...NOT_DELETED,
  };

  it('revives a manually-deactivated offer (inactive, not deleted)', async () => {
    await seedOffer({ offerId: 'manual', status: 'inactive', deletedAt: null });

    await db.collection(DOMAIN_COLLECTIONS.nexusOffers).updateMany(
      reactivateFilter,
      { $set: { status: 'active' } },
    );

    expect(await statusOf('manual')).toBe('active');
  });

  it('revives a legacy inactive offer that has no deletedAt field at all', async () => {
    // Pre-existing docs created before the field existed must still be treated
    // as not-deleted; { deletedAt: null } matches a missing field in MongoDB.
    await seedOffer({ offerId: 'legacy', status: 'inactive' });

    await db.collection(DOMAIN_COLLECTIONS.nexusOffers).updateMany(
      reactivateFilter,
      { $set: { status: 'active' } },
    );

    expect(await statusOf('legacy')).toBe('active');
  });

  it('does NOT revive a soft-deleted offer (the bug)', async () => {
    await seedOffer({ offerId: 'deleted', status: 'inactive', deletedAt: new Date() });

    await db.collection(DOMAIN_COLLECTIONS.nexusOffers).updateMany(
      reactivateFilter,
      { $set: { status: 'active' } },
    );

    expect(await statusOf('deleted')).toBe('inactive');
  });

  it('revives only the non-deleted offers in a mixed set', async () => {
    await seedOffer({ offerId: 'a', status: 'inactive', deletedAt: null });
    await seedOffer({ offerId: 'b', status: 'inactive' });
    await seedOffer({ offerId: 'c', status: 'inactive', deletedAt: new Date() });

    await db.collection(DOMAIN_COLLECTIONS.nexusOffers).updateMany(
      reactivateFilter,
      { $set: { status: 'active' } },
    );

    expect(await statusOf('a')).toBe('active');
    expect(await statusOf('b')).toBe('active');
    expect(await statusOf('c')).toBe('inactive');
  });
});
