/**
 * Tests the login-OTP challenge lifecycle: start/verify happy path,
 * wrong-code attempts + lock, expiry, single-use, resend rate limit.
 * Mail transport mocked; plaintext code captured via test-only __testCode.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

vi.mock('../../../src/services/email/login-otp-email.service', () => ({
  sendLoginOtpMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../src/services/email/wallet-password-email.service', () => ({
  sendWalletLoginCodeMessage: vi.fn().mockResolvedValue(undefined),
  sendWalletResetCodeMessage: vi.fn().mockResolvedValue(undefined),
}));

import {
  startLoginOtpChallenge,
  verifyLoginOtpChallenge,
  resendLoginOtpCode,
} from '../../../src/services/auth/login-otp.service';
import { sendLoginOtpMessage } from '../../../src/services/email/login-otp-email.service';
import {
  sendWalletLoginCodeMessage,
  sendWalletResetCodeMessage,
} from '../../../src/services/email/wallet-password-email.service';
import { LOGIN_OTP_COLLECTION } from '../../../src/models/auth/login-otp.models';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(LOGIN_OTP_COLLECTION).deleteMany({});
  await db.collection('walletRateLimits').deleteMany({});
  vi.clearAllMocks();
});

const START_ARGS = { prismaUserId: 'user_1', email: 'Owner@Org.com', ip: '1.1.1.1', lang: 'en' as const };

describe('login OTP challenge', () => {
  it('start + verify happy path returns the user id', async () => {
    const r = await startLoginOtpChallenge(db, START_ARGS);
    expect(r.challengeToken.length).toBeGreaterThanOrEqual(48);
    expect(r.__testCode).toMatch(/^\d{6}$/);
    expect(sendLoginOtpMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@org.com', code: r.__testCode, lang: 'en' }),
    );
    const out = await verifyLoginOtpChallenge(db, { challengeToken: r.challengeToken, code: r.__testCode! });
    expect(out.prismaUserId).toBe('user_1');
    expect(out.email).toBe('owner@org.com');
  });

  it('challenge is single-use', async () => {
    const r = await startLoginOtpChallenge(db, START_ARGS);
    await verifyLoginOtpChallenge(db, { challengeToken: r.challengeToken, code: r.__testCode! });
    await expect(
      verifyLoginOtpChallenge(db, { challengeToken: r.challengeToken, code: r.__testCode! }),
    ).rejects.toThrow('otp_invalid');
  });

  it('wrong code increments attempts and locks after 5', async () => {
    const r = await startLoginOtpChallenge(db, START_ARGS);
    for (let i = 0; i < 5; i++) {
      await expect(
        verifyLoginOtpChallenge(db, { challengeToken: r.challengeToken, code: '000000' }),
      ).rejects.toThrow('otp_invalid');
    }
    // 6th attempt hits the lock even with the right code.
    await expect(
      verifyLoginOtpChallenge(db, { challengeToken: r.challengeToken, code: r.__testCode! }),
    ).rejects.toThrow('otp_locked');
  });

  it('rejects an expired challenge', async () => {
    const r = await startLoginOtpChallenge(db, START_ARGS);
    await db.collection(LOGIN_OTP_COLLECTION).updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(
      verifyLoginOtpChallenge(db, { challengeToken: r.challengeToken, code: r.__testCode! }),
    ).rejects.toThrow('otp_invalid');
  });

  it('rejects a garbage token', async () => {
    await expect(
      verifyLoginOtpChallenge(db, { challengeToken: 'not-a-real-token', code: '123456' }),
    ).rejects.toThrow('otp_invalid');
  });

  it('rate-limits a second start inside 30 seconds for the same email', async () => {
    await startLoginOtpChallenge(db, START_ARGS);
    await expect(startLoginOtpChallenge(db, START_ARGS)).rejects.toThrow(/rate_limited/);
  });

  it('resend rotates the code on the same challenge and respects the cooldown', async () => {
    const r = await startLoginOtpChallenge(db, START_ARGS);
    // Inside the 30s window the resend is blocked.
    await expect(resendLoginOtpCode(db, { challengeToken: r.challengeToken })).rejects.toThrow(/rate_limited/);
    // Clear the rate-limit bucket to simulate the cooldown passing.
    await db.collection('walletRateLimits').deleteMany({});
    const resent = await resendLoginOtpCode(db, { challengeToken: r.challengeToken });
    expect(resent.__testCode).toMatch(/^\d{6}$/);
    // Old code no longer valid, new one is.
    await expect(
      verifyLoginOtpChallenge(db, { challengeToken: r.challengeToken, code: r.__testCode! }),
    ).rejects.toThrow('otp_invalid');
    const out = await verifyLoginOtpChallenge(db, { challengeToken: r.challengeToken, code: resent.__testCode! });
    expect(out.prismaUserId).toBe('user_1');
  });

  it('carries purpose + pendingPasswordHash through start -> verify, allows null prismaUserId', async () => {
    const start = await startLoginOtpChallenge(db, {
      prismaUserId: null,
      email: 'new@wallet.test',
      ip: null,
      lang: 'en',
      purpose: 'wallet_signup',
      pendingPasswordHash: 'bcrypt-hash-here',
    });
    expect(sendWalletLoginCodeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'new@wallet.test', code: start.__testCode, lang: 'en' }),
    );
    expect(sendLoginOtpMessage).not.toHaveBeenCalled();
    const verified = await verifyLoginOtpChallenge(db, {
      challengeToken: start.challengeToken,
      code: start.__testCode!,
    });
    expect(verified.prismaUserId).toBeNull();
    expect(verified.purpose).toBe('wallet_signup');
    expect(verified.pendingPasswordHash).toBe('bcrypt-hash-here');
  });

  it('routes wallet_reset codes to the reset email template', async () => {
    const start = await startLoginOtpChallenge(db, {
      prismaUserId: 'user_9',
      email: 'reset@wallet.test',
      ip: null,
      lang: 'he',
      purpose: 'wallet_reset',
    });
    expect(sendWalletResetCodeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'reset@wallet.test', code: start.__testCode, lang: 'he' }),
    );
    expect(sendLoginOtpMessage).not.toHaveBeenCalled();
  });
});
