/**
 * Tests for tenant contact-phone change: Israeli mobiles require a matching,
 * unexpired, unconsumed OTP challenge whose own phone equals the requested
 * one; foreign numbers save directly with no verification. InforU is mocked.
 *
 * Uses the shared in-memory Mongo (TEST_MONGODB_URI); getMongoDb is mocked to
 * a per-file db since syncDomainTenantCoreDocs (called by saveTenantPhone via
 * updateTenantIdentity) uses the real singleton.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/sms/inforu.client', () => ({
  inforuSendSms: vi.fn(),
}));

import { startTenantPhoneChange, saveTenantPhone } from '../../src/services/tenant-phone.service';
import { inforuSendSms } from '../../src/services/sms/inforu.client';
import { getOnboardingCollections } from '../../src/models/onboarding.models';
import { getTenantDomainCollections } from '../../src/models/domain/tenant.models';

let client: MongoClient;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_tenant_phone_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

async function seedTenant(): Promise<string> {
  const { tenants } = getOnboardingCollections(db);
  const now = new Date();
  const insert = await tenants.insertOne({
    organizationName: 'Acme',
    website: 'https://acme.example.com',
    businessDescription: 'A description that is long enough to pass validation checks here.',
    selectedUseCases: ['loyalty'],
    contactPhone: '0501234567',
    contactRole: 'owner',
    createdByUserId: 'user-1',
    status: 'active',
    businessSetupStatus: 'not_started',
    createdAt: now,
    updatedAt: now,
  });
  const tenantId = insert.insertedId.toHexString();
  const { domainTenants } = getTenantDomainCollections(db);
  await domainTenants.insertOne({
    tenantId,
    organizationName: 'Acme',
    status: 'build_mode',
    plan: 'basic',
    createdByIdentityId: 'identity-1',
    autoAcceptJoinRequests: true,
    autoApproveOffers: false,
    autoAdoptAdminOffers: true,
    createdAt: now,
    updatedAt: now,
  });
  return tenantId;
}

beforeEach(async () => {
  const { tenants } = getOnboardingCollections(db);
  const { domainTenants, tenantProfiles } = getTenantDomainCollections(db);
  await tenants.deleteMany({});
  await domainTenants.deleteMany({});
  await tenantProfiles.deleteMany({});
  await db.collection('phoneOtpChallenges').deleteMany({});
  await db.collection('walletRateLimits').deleteMany({});
  vi.clearAllMocks();
  (inforuSendSms as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe('startTenantPhoneChange', () => {
  it('rejects a non-Israeli phone', async () => {
    await expect(
      startTenantPhoneChange(db, { phone: '+14155551234', ip: '1.1.1.1' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(inforuSendSms).not.toHaveBeenCalled();
  });

  it('sends an OTP for a valid Israeli mobile', async () => {
    const r = await startTenantPhoneChange(db, { phone: '+972508465858', ip: '1.1.1.1' });
    expect(r.challengeId).toMatch(/^[a-f0-9]{24}$/);
    expect(inforuSendSms).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '0508465858' }),
    );
  });
});

describe('saveTenantPhone', () => {
  it('saves a foreign number without any OTP', async () => {
    const tenantId = await seedTenant();
    const out = await saveTenantPhone(db, {
      tenantId,
      callerIdentityId: 'identity-1',
      phone: '+14155551234',
    });
    expect(out.contactPhone).toBe('+14155551234');
    expect(inforuSendSms).not.toHaveBeenCalled();
  });

  it('rejects an Israeli mobile with no challenge/code', async () => {
    const tenantId = await seedTenant();
    await expect(
      saveTenantPhone(db, { tenantId, callerIdentityId: 'identity-1', phone: '0508465858' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an invalid Israeli-prefixed number outright', async () => {
    const tenantId = await seedTenant();
    await expect(
      saveTenantPhone(db, { tenantId, callerIdentityId: 'identity-1', phone: '+97248465858' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('saves an Israeli mobile with the correct code and consumes the challenge', async () => {
    const tenantId = await seedTenant();
    const start = await startTenantPhoneChange(db, { phone: '0508465858', ip: '1.1.1.1' });
    const out = await saveTenantPhone(db, {
      tenantId,
      callerIdentityId: 'identity-1',
      phone: '0508465858',
      challengeId: start.challengeId,
      otpCode: start.__testCode!,
    });
    expect(out.contactPhone).toBe('0508465858');

    const { tenants } = getOnboardingCollections(db);
    const legacy = await tenants.findOne({});
    expect(legacy?.contactPhone).toBe('0508465858');

    // The same challenge cannot be reused.
    await expect(
      saveTenantPhone(db, {
        tenantId,
        callerIdentityId: 'identity-1',
        phone: '0508465858',
        challengeId: start.challengeId,
        otpCode: start.__testCode!,
      }),
    ).rejects.toThrow('otp_invalid');
  });

  it('rejects a wrong code', async () => {
    const tenantId = await seedTenant();
    const start = await startTenantPhoneChange(db, { phone: '0508465858', ip: '1.1.1.1' });
    await expect(
      saveTenantPhone(db, {
        tenantId,
        callerIdentityId: 'identity-1',
        phone: '0508465858',
        challengeId: start.challengeId,
        otpCode: '000000',
      }),
    ).rejects.toThrow('otp_invalid');
  });

  it('rejects a challenge issued for a different phone number', async () => {
    const tenantId = await seedTenant();
    const start = await startTenantPhoneChange(db, { phone: '0508465858', ip: '1.1.1.1' });
    await expect(
      saveTenantPhone(db, {
        tenantId,
        callerIdentityId: 'identity-1',
        phone: '0521112222',
        challengeId: start.challengeId,
        otpCode: start.__testCode!,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
