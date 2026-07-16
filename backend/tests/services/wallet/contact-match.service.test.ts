/**
 * Contact-match lookup tests: which tenants listed the caller's verified
 * identifiers in their contacts. Branding-only output; active-catalog and
 * existing-membership filters.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { DOMAIN_COLLECTIONS } from '../../../src/models/domain/collections';
import { findContactMatchTenants } from '../../../src/services/wallet/contact-match.service';

let client: MongoClient;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_contact_match_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await Promise.all([
    db.collection(DOMAIN_COLLECTIONS.domainTenants).deleteMany({}),
    db.collection(DOMAIN_COLLECTIONS.tenantContacts).deleteMany({}),
    db.collection(DOMAIN_COLLECTIONS.tenantMembers).deleteMany({}),
    db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).deleteMany({}),
  ]);
});

async function seedTenant(tenantId: string, opts: { catalogActive?: boolean } = {}): Promise<void> {
  const now = new Date();
  await db.collection(DOMAIN_COLLECTIONS.domainTenants).insertOne({
    tenantId, organizationName: `Org ${tenantId}`, status: 'active', plan: 'basic',
    logoUrl: `https://img.example/${tenantId}.png`, brandColor: '#635bff',
    createdByIdentityId: 'x', createdAt: now, updatedAt: now,
  });
  if (opts.catalogActive !== false) {
    await db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).insertOne({
      tenantServiceActivationId: `tsa_${tenantId}`, tenantId,
      serviceKey: 'benefits_catalog', status: 'active', createdAt: now, updatedAt: now,
    });
  }
}

async function seedContact(tenantId: string, fields: Record<string, unknown>): Promise<void> {
  const now = new Date();
  await db.collection(DOMAIN_COLLECTIONS.tenantContacts).insertOne({
    tenantContactId: `tc_${tenantId}_${Math.random()}`, tenantId,
    displayName: 'Someone', status: 'inactive', createdAt: now, updatedAt: now, ...fields,
  });
}

const CALLER = { nexusIdentityId: 'id-1', normalizedEmail: 'me@x.com', phone: '0508465858' };

describe('findContactMatchTenants', () => {
  it('matches by email, by phone, and dedups the union', async () => {
    await seedTenant('t-email');
    await seedTenant('t-phone');
    await seedTenant('t-both');
    await seedContact('t-email', { email: 'me@x.com', normalizedEmail: 'me@x.com' });
    await seedContact('t-phone', { email: 'other@x.com', normalizedEmail: 'other@x.com', phone: '0508465858' });
    await seedContact('t-both', { email: 'me@x.com', normalizedEmail: 'me@x.com' });
    await seedContact('t-both', { email: 'third@x.com', normalizedEmail: 'third@x.com', phone: '0508465858' });

    const out = await findContactMatchTenants(db, CALLER);
    expect(out.map((t) => t.tenantId).sort()).toEqual(['t-both', 't-email', 't-phone']);
  });

  it('excludes tenants without an active benefits catalog', async () => {
    await seedTenant('t-inactive', { catalogActive: false });
    await seedContact('t-inactive', { email: 'me@x.com', normalizedEmail: 'me@x.com' });
    await expect(findContactMatchTenants(db, CALLER)).resolves.toEqual([]);
  });

  it('excludes tenants where the caller already has a tenantMembers row', async () => {
    await seedTenant('t-member');
    await seedContact('t-member', { email: 'me@x.com', normalizedEmail: 'me@x.com' });
    await db.collection(DOMAIN_COLLECTIONS.tenantMembers).insertOne({
      tenantMemberId: 'tm-1', tenantId: 't-member', nexusIdentityId: 'id-1',
      status: 'active', services: [], createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(findContactMatchTenants(db, CALLER)).resolves.toEqual([]);
  });

  it('returns tenant public branding only - never contact rows', async () => {
    await seedTenant('t1');
    await seedContact('t1', { email: 'me@x.com', normalizedEmail: 'me@x.com', phone: '0501112222' });
    const [t] = await findContactMatchTenants(db, CALLER);
    expect(t).toBeDefined();
    const allowed = new Set(['tenantId', 'name', 'logoUrl', 'logoCrop', 'brandColor']);
    for (const key of Object.keys(t!)) expect(allowed.has(key)).toBe(true);
    expect(t!.name).toBe('Org t1');
    expect(t!.brandColor).toBe('#635bff');
  });

  it('skips the phone clause when no verified phone is supplied', async () => {
    await seedTenant('t-phone-only');
    await seedContact('t-phone-only', { email: 'x@y.com', normalizedEmail: 'x@y.com', phone: '0508465858' });
    const out = await findContactMatchTenants(db, { nexusIdentityId: 'id-1', normalizedEmail: 'me@x.com' });
    expect(out).toEqual([]);
  });
});
