/**
 * Tests the login orchestration: member logs straight in; privileged user
 * on an unknown device gets mfa_required; trusted device skips the OTP;
 * completing the OTP issues tokens + a trusted device.
 * Prisma-facing auth.service and mail transport are mocked; Mongo is real.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

const mocks = vi.hoisted(() => ({
  verifyCredentials: vi.fn(),
  issueTokens: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  getMongoDb: vi.fn(),
}));

vi.mock('../../../src/services/auth.service', () => ({
  verifyCredentials: mocks.verifyCredentials,
  issueTokens: mocks.issueTokens,
}));
vi.mock('../../../src/config/database', () => ({
  prisma: { user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate } },
}));
vi.mock('../../../src/config/mongo', () => ({ getMongoDb: mocks.getMongoDb }));
vi.mock('../../../src/services/email/login-otp-email.service', () => ({
  sendLoginOtpMessage: vi.fn().mockResolvedValue(undefined),
}));

import { performLogin, completeLoginOtp } from '../../../src/services/auth/login-mfa.service';
import { issueTrustedDevice } from '../../../src/services/auth/trusted-device.service';
import { sendLoginOtpMessage } from '../../../src/services/email/login-otp-email.service';
import { getIdentityDomainCollections } from '../../../src/models/domain/identity.models';
import { getTenantDomainCollections } from '../../../src/models/domain/tenant.models';
import { LOGIN_OTP_COLLECTION } from '../../../src/models/auth/login-otp.models';
import { TRUSTED_DEVICE_COLLECTION } from '../../../src/models/auth/trusted-device.models';

let client: MongoClient;
let db: Db;

const USER = { id: 'u1', email: 'owner@org.com', role: 'USER' };
const TOKENS = { accessToken: 'at', rawRefreshToken: 'rt', userId: 'u1' };
const META = { userAgent: 'UA', ipAddress: '1.1.1.1' };

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  for (const c of [LOGIN_OTP_COLLECTION, TRUSTED_DEVICE_COLLECTION, 'walletRateLimits']) {
    await db.collection(c).deleteMany({});
  }
  const identity = getIdentityDomainCollections(db);
  const tenants = getTenantDomainCollections(db);
  await identity.nexusIdentities.deleteMany({});
  await identity.tenantUserRoles.deleteMany({});
  await tenants.tenantMembers.deleteMany({});
  vi.clearAllMocks();
  mocks.getMongoDb.mockResolvedValue(db);
  mocks.verifyCredentials.mockResolvedValue(USER);
  mocks.issueTokens.mockResolvedValue(TOKENS);
  mocks.userFindUnique.mockResolvedValue(USER);
  mocks.userUpdate.mockResolvedValue(USER);
});

/** Marks owner@org.com as a privileged (admin) tenant user in Mongo. */
async function seedPrivileged() {
  const identity = getIdentityDomainCollections(db);
  const tenants = getTenantDomainCollections(db);
  await identity.nexusIdentities.insertOne({ nexusIdentityId: 'id1', normalizedEmail: 'owner@org.com' } as never);
  await tenants.tenantMembers.insertOne({ nexusIdentityId: 'id1', tenantId: 't1', status: 'active', createdAt: new Date() } as never);
  await identity.tenantUserRoles.insertOne({ nexusIdentityId: 'id1', tenantId: 't1', role: 'admin' } as never);
}

describe('performLogin', () => {
  it('non-privileged user gets a session immediately', async () => {
    const out = await performLogin({ email: 'owner@org.com', password: 'pw', trustedDeviceToken: null, lang: 'en', ...META });
    expect(out).toEqual({ kind: 'session', ...TOKENS });
    expect(mocks.userUpdate).toHaveBeenCalled(); // lastLoginAt stamped
  });

  it('privileged user on an unknown device gets mfa_required and NO tokens', async () => {
    await seedPrivileged();
    const out = await performLogin({ email: 'owner@org.com', password: 'pw', trustedDeviceToken: null, lang: 'en', ...META });
    expect(out.kind).toBe('mfa_required');
    if (out.kind === 'mfa_required') expect(out.challengeToken.length).toBeGreaterThanOrEqual(48);
    expect(mocks.issueTokens).not.toHaveBeenCalled();
  });

  it('privileged user with a trusted device skips the OTP', async () => {
    await seedPrivileged();
    const raw = await issueTrustedDevice(db, { prismaUserId: 'u1', userAgent: null, ipAddress: null });
    const out = await performLogin({ email: 'owner@org.com', password: 'pw', trustedDeviceToken: raw, lang: 'en', ...META });
    expect(out).toEqual({ kind: 'session', ...TOKENS });
  });

  it('bad credentials propagate before any challenge is created', async () => {
    mocks.verifyCredentials.mockRejectedValue(Object.assign(new Error('Invalid email or password'), { status: 401 }));
    await expect(
      performLogin({ email: 'owner@org.com', password: 'bad', trustedDeviceToken: null, lang: 'en', ...META }),
    ).rejects.toThrow('Invalid email or password');
    expect(await db.collection(LOGIN_OTP_COLLECTION).countDocuments({})).toBe(0);
  });
});

describe('completeLoginOtp', () => {
  it('verifies the code, issues tokens, and trusts the device', async () => {
    await seedPrivileged();
    const start = await performLogin({ email: 'owner@org.com', password: 'pw', trustedDeviceToken: null, lang: 'en', ...META });
    if (start.kind !== 'mfa_required') throw new Error('expected mfa_required');
    // Recover the plaintext code via the mocked mail module.
    const code = (sendLoginOtpMessage as ReturnType<typeof vi.fn>).mock.calls[0][0].code as string;

    const out = await completeLoginOtp({ challengeToken: start.challengeToken, code, ...META });
    expect(out.accessToken).toBe('at');
    expect(out.trustedDeviceToken.length).toBeGreaterThanOrEqual(64);
    expect(await db.collection(TRUSTED_DEVICE_COLLECTION).countDocuments({ prismaUserId: 'u1' })).toBe(1);
  });
});
