/**
 * Behavior tests for the wallet email+password auth orchestration: separate
 * login vs register intents with mandatory 2FA, per-account lockout, and the
 * code-based forgot-password flow (decoy tokens for unknown emails).
 * Prisma + identity resolution + mail transport mocked; Mongo is real.
 * Spec: docs/superpowers/specs/2026-07-14-wallet-email-password-auth-design.md
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import bcrypt from 'bcryptjs';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  userUpdateMany: vi.fn(),
  refreshTokenUpdateMany: vi.fn(),
  transaction: vi.fn(),
  resolveWalletIdentity: vi.fn(),
}));

vi.mock('../../../src/config/database', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
      updateMany: mocks.userUpdateMany,
    },
    refreshToken: { updateMany: mocks.refreshTokenUpdateMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock('../../../src/services/auth/wallet-identity.service', () => ({
  resolveWalletIdentity: mocks.resolveWalletIdentity,
}));
vi.mock('../../../src/services/email/wallet-password-email.service', () => ({
  sendWalletLoginCodeMessage: vi.fn().mockResolvedValue(undefined),
  sendWalletResetCodeMessage: vi.fn().mockResolvedValue(undefined),
}));

import {
  startPasswordLogin,
  completePasswordChallenge,
  startPasswordForgot,
  verifyPasswordForgot,
  completePasswordForgot,
} from '../../../src/services/auth/wallet-password.service';
import {
  sendWalletLoginCodeMessage,
  sendWalletResetCodeMessage,
} from '../../../src/services/email/wallet-password-email.service';
import { LOGIN_OTP_COLLECTION } from '../../../src/models/auth/login-otp.models';
import { countRecentEvents } from '../../../src/services/auth/wallet-rate-limit';

let client: MongoClient;
let db: Db;

const PASSWORD = 'Str0ng!pass';
const RESOLVED = {
  prismaUserId: 'u1',
  email: 'user@wallet.test',
  role: 'USER',
  identityCreated: false,
  phoneLinked: false,
};

/** A Prisma user row with a real bcrypt hash of PASSWORD. */
let userWithPassword: { id: string; email: string; role: string; passwordHash: string };

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_wallet_pwd_${Date.now()}`);
  userWithPassword = {
    id: 'u1',
    email: 'user@wallet.test',
    role: 'USER',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  };
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(LOGIN_OTP_COLLECTION).deleteMany({});
  await db.collection('walletRateLimits').deleteMany({});
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue(userWithPassword);
  mocks.userUpdate.mockResolvedValue(userWithPassword);
  mocks.userUpdateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockResolvedValue([]);
  mocks.resolveWalletIdentity.mockResolvedValue(RESOLVED);
});

/** Clears the per-email send-cooldown buckets so a follow-up send is allowed. */
async function clearSendLimits() {
  await db.collection('walletRateLimits').deleteMany({
    bucket: { $in: ['login_otp_send', 'login_otp_send_hourly', 'pwd_forgot_send', 'pwd_forgot_send_hourly'] },
  });
}

const LOGIN_ARGS = { email: 'user@wallet.test', password: PASSWORD, ip: '1.1.1.1', lang: 'en' as const };

describe('startPasswordLogin', () => {
  it('existing user + correct password -> 2FA challenge, no failure recorded', async () => {
    const out = await startPasswordLogin(db, LOGIN_ARGS);
    expect(out.challengeToken.length).toBeGreaterThanOrEqual(48);
    expect(out.__testCode).toMatch(/^\d{6}$/);
    expect(sendWalletLoginCodeMessage).toHaveBeenCalled();
    expect(await countRecentEvents(db, { bucket: 'pwd_fail', key: 'user@wallet.test', windowSec: 900 })).toBe(0);
    const doc = await db.collection(LOGIN_OTP_COLLECTION).findOne({});
    expect(doc?.purpose).toBe('wallet_login');
  });

  it('wrong password -> invalid_credentials, failure recorded', async () => {
    await expect(
      startPasswordLogin(db, { ...LOGIN_ARGS, password: 'Wrong1!pass' }),
    ).rejects.toThrow('invalid_credentials');
    expect(await countRecentEvents(db, { bucket: 'pwd_fail', key: 'user@wallet.test', windowSec: 900 })).toBe(1);
  });

  it('passwordless account -> the same invalid_credentials', async () => {
    mocks.userFindUnique.mockResolvedValue({ ...userWithPassword, passwordHash: null });
    await expect(startPasswordLogin(db, LOGIN_ARGS)).rejects.toThrow('invalid_credentials');
  });

  it('locks after 5 failures, even with the correct password', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        startPasswordLogin(db, { ...LOGIN_ARGS, password: 'Wrong1!pass' }),
      ).rejects.toThrow('invalid_credentials');
    }
    await expect(startPasswordLogin(db, LOGIN_ARGS)).rejects.toThrow('account_locked');
  });

  it('login intent + unknown email -> invalid_credentials, nothing created, no failure recorded', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    await expect(startPasswordLogin(db, LOGIN_ARGS)).rejects.toThrow('invalid_credentials');
    expect(await db.collection(LOGIN_OTP_COLLECTION).countDocuments({})).toBe(0);
    // Unknown emails must not count toward the lockout (no account to protect).
    expect(await countRecentEvents(db, { bucket: 'pwd_fail', key: 'user@wallet.test', windowSec: 900 })).toBe(0);
  });

  it('signup intent + unknown email + compliant password -> signup challenge with a stashed bcrypt hash', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    const out = await startPasswordLogin(db, { ...LOGIN_ARGS, intent: 'signup' });
    expect(out.challengeToken.length).toBeGreaterThanOrEqual(48);
    const doc = await db.collection(LOGIN_OTP_COLLECTION).findOne({});
    expect(doc?.purpose).toBe('wallet_signup');
    expect(doc?.prismaUserId).toBeNull();
    expect(await bcrypt.compare(PASSWORD, doc?.pendingPasswordHash as string)).toBe(true);
  });

  it('signup intent + existing email -> account_exists, nothing stored', async () => {
    // userFindUnique defaults to an existing user.
    await expect(
      startPasswordLogin(db, { ...LOGIN_ARGS, intent: 'signup' }),
    ).rejects.toThrow('account_exists');
    expect(await db.collection(LOGIN_OTP_COLLECTION).countDocuments({})).toBe(0);
  });

  it('signup intent + unknown email + weak password -> weak_password, nothing stored', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    await expect(
      startPasswordLogin(db, { ...LOGIN_ARGS, intent: 'signup', password: 'weakpass' }),
    ).rejects.toThrow('weak_password');
    expect(await db.collection(LOGIN_OTP_COLLECTION).countDocuments({})).toBe(0);
  });
});

describe('completePasswordChallenge', () => {
  it('wallet_login -> resolves identity + stamps lastLoginAt', async () => {
    const start = await startPasswordLogin(db, LOGIN_ARGS);
    const out = await completePasswordChallenge(db, {
      challengeToken: start.challengeToken,
      code: start.__testCode!,
    });
    expect(out).toEqual(RESOLVED);
    expect(mocks.resolveWalletIdentity).toHaveBeenCalledWith({
      email: 'user@wallet.test',
      verifiedPhone: null,
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
  });

  it('wallet_signup -> sets the stashed hash only where passwordHash is null (race guard)', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    const start = await startPasswordLogin(db, { ...LOGIN_ARGS, intent: 'signup' });
    mocks.resolveWalletIdentity.mockResolvedValue({ ...RESOLVED, identityCreated: true });
    const out = await completePasswordChallenge(db, {
      challengeToken: start.challengeToken,
      code: start.__testCode!,
    });
    expect(out.identityCreated).toBe(true);
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: { email: 'user@wallet.test', passwordHash: null },
      data: { passwordHash: expect.any(String) },
    });
  });

  it('rejects a wallet_reset challenge (otp_invalid)', async () => {
    const start = await startPasswordForgot(db, { email: 'user@wallet.test', ip: null, lang: 'en' });
    await expect(
      completePasswordChallenge(db, { challengeToken: start.challengeToken, code: start.__testCode! }),
    ).rejects.toThrow('otp_invalid');
  });
});

describe('forgot flow', () => {
  const FORGOT_ARGS = { email: 'user@wallet.test', ip: null, lang: 'en' as const };

  it('known email (even passwordless) -> stored challenge + reset email', async () => {
    mocks.userFindUnique.mockResolvedValue({ ...userWithPassword, passwordHash: null });
    const out = await startPasswordForgot(db, FORGOT_ARGS);
    expect(out.__testCode).toMatch(/^\d{6}$/);
    expect(sendWalletResetCodeMessage).toHaveBeenCalled();
    const doc = await db.collection(LOGIN_OTP_COLLECTION).findOne({});
    expect(doc?.purpose).toBe('wallet_reset');
  });

  it('unknown email -> decoy token, nothing stored, same shape', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    const out = await startPasswordForgot(db, FORGOT_ARGS);
    expect(out.challengeToken.length).toBeGreaterThanOrEqual(48);
    expect(sendWalletResetCodeMessage).not.toHaveBeenCalled();
    expect(await db.collection(LOGIN_OTP_COLLECTION).countDocuments({})).toBe(0);
    await expect(
      verifyPasswordForgot(db, { challengeToken: out.challengeToken, code: '123456' }),
    ).rejects.toThrow('otp_invalid');
  });

  it('complete without a prior verify -> otp_invalid', async () => {
    const start = await startPasswordForgot(db, FORGOT_ARGS);
    await expect(
      completePasswordForgot(db, { challengeToken: start.challengeToken, newPassword: 'N3w!passw' }),
    ).rejects.toThrow('otp_invalid');
  });

  it('complete: weak password rejected', async () => {
    const start = await startPasswordForgot(db, FORGOT_ARGS);
    await verifyPasswordForgot(db, { challengeToken: start.challengeToken, code: start.__testCode! });
    await expect(
      completePasswordForgot(db, { challengeToken: start.challengeToken, newPassword: 'weakpass' }),
    ).rejects.toThrow('weak_password');
  });

  it('complete: same-as-current rejected (password_unchanged)', async () => {
    const start = await startPasswordForgot(db, FORGOT_ARGS);
    await verifyPasswordForgot(db, { challengeToken: start.challengeToken, code: start.__testCode! });
    await expect(
      completePasswordForgot(db, { challengeToken: start.challengeToken, newPassword: PASSWORD }),
    ).rejects.toThrow('password_unchanged');
  });

  it('complete: sets hash + revokes refresh tokens + single-use', async () => {
    const start = await startPasswordForgot(db, FORGOT_ARGS);
    await verifyPasswordForgot(db, { challengeToken: start.challengeToken, code: start.__testCode! });
    await completePasswordForgot(db, { challengeToken: start.challengeToken, newPassword: 'N3w!passw' });
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { passwordHash: expect.any(String) },
    });
    expect(mocks.refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { revokedAt: expect.any(Date) },
    });
    // Second complete on the consumed challenge fails.
    await expect(
      completePasswordForgot(db, { challengeToken: start.challengeToken, newPassword: 'N3w!passw2' }),
    ).rejects.toThrow('otp_invalid');
  });

  it('completing one reset expires sibling reset challenges for the email', async () => {
    const first = await startPasswordForgot(db, FORGOT_ARGS);
    await clearSendLimits();
    const second = await startPasswordForgot(db, FORGOT_ARGS);
    await verifyPasswordForgot(db, { challengeToken: second.challengeToken, code: second.__testCode! });
    await completePasswordForgot(db, { challengeToken: second.challengeToken, newPassword: 'N3w!passw' });
    await expect(
      verifyPasswordForgot(db, { challengeToken: first.challengeToken, code: first.__testCode! }),
    ).rejects.toThrow('otp_invalid');
  });
});
