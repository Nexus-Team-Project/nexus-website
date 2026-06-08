import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../../src/models/domain/collections';
import { TENANT_JOIN_REQUEST_COLLECTION } from '../../../src/models/auth/tenant-join-request.models';
import { materializeTenantMembership, createJoinRequests } from '../../../src/services/wallet/join-request.service';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = new MongoClient(process.env.TEST_MONGODB_URI as string);
  await client.connect();
  db = client.db(`jr_mirror_${Date.now()}`);
});
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  for (const c of [DOMAIN_COLLECTIONS.nexusIdentities, DOMAIN_COLLECTIONS.tenantMembers,
    DOMAIN_COLLECTIONS.tenantContacts, DOMAIN_COLLECTIONS.tenantContactFields,
    DOMAIN_COLLECTIONS.tenantUserRoles, DOMAIN_COLLECTIONS.domainTenants,
    DOMAIN_COLLECTIONS.tenantServiceActivations, DOMAIN_COLLECTIONS.tenantMemberInvitations,
    TENANT_JOIN_REQUEST_COLLECTION]) {
    await db.collection(c).deleteMany({});
  }
});

async function seedIdentity() {
  await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
    nexusIdentityId: 'id1', normalizedEmail: 'a@b.com',
    profile: { gender: 'male', purpose: ['gift-cards'] },
  });
}

describe('materializeTenantMembership mirror columns', () => {
  it('writes mirror columns from the identity profile onto the new contact', async () => {
    await seedIdentity();
    await materializeTenantMembership(db, {
      tenantId: 't1', nexusIdentityId: 'id1', email: 'a@b.com', grantedByIdentityId: 'admin1',
    });
    const field = await db.collection(DOMAIN_COLLECTIONS.tenantContactFields)
      .findOne({ tenantId: 't1', sourceFieldKey: 'gender' });
    const contact = await db.collection(DOMAIN_COLLECTIONS.tenantContacts).findOne({ tenantId: 't1' });
    expect(contact!.customFields[field!.fieldId]).toBe('male');
  });
});

describe('createJoinRequests snapshot', () => {
  it('snapshots answers on a pending (non-auto-accept) request', async () => {
    await seedIdentity();
    // Tenant with active catalog but auto-accept OFF -> pending path.
    await db.collection(DOMAIN_COLLECTIONS.domainTenants).insertOne({
      tenantId: 't1', organizationName: 'Acme', status: 'active', plan: 'basic',
      autoAcceptJoinRequests: false, createdAt: new Date(), updatedAt: new Date(),
    });
    await db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).insertOne({
      tenantServiceActivationId: 'act1', tenantId: 't1', serviceKey: 'benefits_catalog',
      status: 'active', createdAt: new Date(), updatedAt: new Date(),
    });

    const r = await createJoinRequests(db, {
      nexusIdentityId: 'id1', email: 'a@b.com', displayName: 'A', tenantIds: ['t1'],
    });
    expect(r.created).toEqual(['t1']);
    const reqDoc = await db.collection(TENANT_JOIN_REQUEST_COLLECTION).findOne({ tenantId: 't1' });
    expect(reqDoc!.answersSnapshot).toMatchObject({ gender: 'male', purpose: ['gift-cards'] });
  });
});
