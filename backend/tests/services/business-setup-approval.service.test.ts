/**
 * Behavioral tests for the M8 business-setup approval service (in-memory Mongo).
 * Covers: listing pending tenants with their submitted details + devMode flag,
 * the pending count, approve/deny (flag flip + audit + owner email), the
 * isTenantBusinessSetupApproved gate resolver, and 404 for unknown/non-pending.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db, ObjectId } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/business-setup-approval-email.service', () => ({
  sendBusinessSetupApproved: vi.fn(async () => {}),
  sendBusinessSetupDenied: vi.fn(async () => {}),
  sendBusinessSetupSubmittedToAdmins: vi.fn(async () => {}),
}));

import {
  listPendingBusinessSetups, approveBusinessSetup, denyBusinessSetup,
  countPendingBusinessSetups, isTenantBusinessSetupApproved,
} from '../../src/services/business-setup-approval.service';
import { sendBusinessSetupApproved, sendBusinessSetupDenied } from '../../src/services/business-setup-approval-email.service';
import { getTenantDomainCollections, getIdentityDomainCollections } from '../../src/models/domain';
import { getOnboardingCollections } from '../../src/models/onboarding.models';

let client: MongoClient;

async function seedTenant(id: ObjectId, name: string, approval: unknown): Promise<void> {
  await getTenantDomainCollections(db).domainTenants.insertOne({
    tenantId: id.toHexString(), organizationName: name, status: 'build_mode',
    createdByIdentityId: 'id_' + name, businessSetupApproval: approval,
    createdAt: new Date(), updatedAt: new Date(),
  } as never);
}

beforeAll(async () => { client = await MongoClient.connect(process.env.TEST_MONGODB_URI!); db = client.db(`nexus_bsa_${Date.now()}`); });
afterAll(async () => { await db.dropDatabase(); await client.close(); });
beforeEach(async () => {
  vi.clearAllMocks();
  await getTenantDomainCollections(db).domainTenants.deleteMany({});
  await getIdentityDomainCollections(db).nexusIdentities.deleteMany({});
  await getOnboardingCollections(db).businessSetups.deleteMany({});
});

describe('business-setup-approval.service', () => {
  it('lists only pending tenants with their submitted details + devMode', async () => {
    const p = new ObjectId(); const a = new ObjectId();
    await seedTenant(p, 'Pending Co', { status: 'pending', devMode: true, submittedAt: new Date() });
    await seedTenant(a, 'Approved Co', { status: 'approved' });
    await getOnboardingCollections(db).businessSetups.insertOne({ tenantId: p, data: { legalName: 'Pending Co Ltd' }, status: 'submitted', createdAt: new Date(), updatedAt: new Date() } as never);
    const res = await listPendingBusinessSetups({ page: 1, limit: 10 });
    expect(res.total).toBe(1);
    expect(res.items[0].organizationName).toBe('Pending Co');
    expect(res.items[0].devMode).toBe(true);
    expect(res.items[0].details).toMatchObject({ legalName: 'Pending Co Ltd' });
  });

  it('countPendingBusinessSetups counts pending only', async () => {
    await seedTenant(new ObjectId(), 'P', { status: 'pending' });
    await seedTenant(new ObjectId(), 'A', { status: 'approved' });
    expect(await countPendingBusinessSetups()).toBe(1);
  });

  it('approve flips to approved + audit + emails owner', async () => {
    const p = new ObjectId();
    await getIdentityDomainCollections(db).nexusIdentities.insertOne({ nexusIdentityId: 'id_P', normalizedEmail: 'owner@p.com' } as never);
    await seedTenant(p, 'P', { status: 'pending' });
    await approveBusinessSetup(p.toHexString(), 'admin@nexus.com');
    const t = await getTenantDomainCollections(db).domainTenants.findOne({ tenantId: p.toHexString() });
    expect(t?.businessSetupApproval?.status).toBe('approved');
    expect(t?.businessSetupApproval?.reviewedByEmail).toBe('admin@nexus.com');
    expect(sendBusinessSetupApproved).toHaveBeenCalledWith('owner@p.com', 'P');
  });

  it('deny flips to denied + stores reason + emails owner', async () => {
    const p = new ObjectId();
    await getIdentityDomainCollections(db).nexusIdentities.insertOne({ nexusIdentityId: 'id_P', normalizedEmail: 'owner@p.com' } as never);
    await seedTenant(p, 'P', { status: 'pending' });
    await denyBusinessSetup(p.toHexString(), 'Missing bank docs', 'admin@nexus.com');
    const t = await getTenantDomainCollections(db).domainTenants.findOne({ tenantId: p.toHexString() });
    expect(t?.businessSetupApproval).toMatchObject({ status: 'denied', reason: 'Missing bank docs', reviewedByEmail: 'admin@nexus.com' });
    expect(sendBusinessSetupDenied).toHaveBeenCalledWith('owner@p.com', 'P', 'Missing bank docs');
  });

  it('isTenantBusinessSetupApproved reflects the flag', async () => {
    const a = new ObjectId(); const p = new ObjectId();
    await seedTenant(a, 'A', { status: 'approved' });
    await seedTenant(p, 'P', { status: 'pending' });
    expect(await isTenantBusinessSetupApproved(a.toHexString())).toBe(true);
    expect(await isTenantBusinessSetupApproved(p.toHexString())).toBe(false);
    expect(await isTenantBusinessSetupApproved('missing')).toBe(false);
  });

  it('approve throws 404 for unknown or non-pending tenant', async () => {
    await expect(approveBusinessSetup('missing', 'a@x')).rejects.toMatchObject({ statusCode: 404 });
    const a = new ObjectId();
    await seedTenant(a, 'A', { status: 'approved' });
    await expect(approveBusinessSetup(a.toHexString(), 'a@x')).rejects.toMatchObject({ statusCode: 404 });
  });
});
