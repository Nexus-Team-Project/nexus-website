/**
 * Tests for listActiveTenantServices: only ACTIVE activations for the given
 * tenant are returned, in the { services: [...] } envelope the outreach
 * modal consumes. Uses the shared in-memory Mongo (TEST_MONGODB_URI).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { listActiveTenantServices } from '../../src/services/domain-service-activation.service';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';

let client: MongoClient;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`svc_list_${Date.now()}`);
});
afterAll(async () => { await db.dropDatabase(); await client.close(); });
beforeEach(async () => {
  await db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).deleteMany({});
});

describe('listActiveTenantServices', () => {
  it('returns only ACTIVE activations belonging to the tenant', async () => {
    const now = new Date();
    await db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).insertMany([
      { tenantServiceActivationId: 'a1', tenantId: 't1', serviceKey: 'benefits_catalog', status: 'active', createdAt: now, updatedAt: now },
      { tenantServiceActivationId: 'a2', tenantId: 't1', serviceKey: 'digital_wallet', status: 'suspended', createdAt: now, updatedAt: now },
      { tenantServiceActivationId: 'a3', tenantId: 't2', serviceKey: 'benefits_catalog', status: 'active', createdAt: now, updatedAt: now },
    ]);
    const result = await listActiveTenantServices('t1');
    expect(result).toEqual({ services: [{ serviceKey: 'benefits_catalog', status: 'active' }] });
  });

  it('returns an empty list when the tenant has no active services', async () => {
    const result = await listActiveTenantServices('t_none');
    expect(result).toEqual({ services: [] });
  });
});
