/**
 * Tests that account deletion covers the tenant-linked shortLinks collection:
 * dry-run counts include links for owned tenants and deleteMongoUser removes
 * them, while other tenants' links survive.
 * Spec: docs/superpowers/specs/2026-07-15-members-service-invite-design.md s.3
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let client: MongoClient;
let db: Db;

vi.mock('../../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { collectMongoCounts, deleteMongoUser } from '../../../src/services/account-deletion/mongo';
import { SHORT_LINK_COLLECTION } from '../../../src/models/domain/short-links.models';
import { DOMAIN_COLLECTIONS } from '../../../src/models/domain/collections';

const EMAIL = 'owner@example.com';

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`acct_del_shortlinks_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  for (const c of [
    DOMAIN_COLLECTIONS.nexusIdentities,
    DOMAIN_COLLECTIONS.domainTenants,
    SHORT_LINK_COLLECTION,
  ]) {
    await db.collection(c).deleteMany({});
  }
  await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
    nexusIdentityId: 'id1',
    normalizedEmail: EMAIL,
  });
  await db.collection(DOMAIN_COLLECTIONS.domainTenants).insertOne({
    tenantId: 't-owned',
    createdByIdentityId: 'id1',
  });
  await db.collection(SHORT_LINK_COLLECTION).insertMany([
    { code: 'aaaaaaa', targetUrl: 'https://w/x', tenantId: 't-owned', serviceKey: 'benefits_catalog', clicks: 0, createdAt: new Date() },
    { code: 'bbbbbbb', targetUrl: 'https://w/y', tenantId: 't-other', serviceKey: 'benefits_catalog', clicks: 0, createdAt: new Date() },
  ]);
});

describe('account deletion + shortLinks', () => {
  it('dry-run count includes shortLinks of owned tenants only', async () => {
    const counts = await collectMongoCounts(EMAIL, null);
    expect(counts.shortLinks).toBe(1);
  });

  it('deleteMongoUser removes owned-tenant shortLinks and keeps others', async () => {
    await deleteMongoUser(EMAIL, null);
    expect(await db.collection(SHORT_LINK_COLLECTION).countDocuments({ tenantId: 't-owned' })).toBe(0);
    expect(await db.collection(SHORT_LINK_COLLECTION).countDocuments({ tenantId: 't-other' })).toBe(1);
  });
});
