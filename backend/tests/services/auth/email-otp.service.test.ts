/**
 * Tests for the email-OTP lifecycle. The delivery transport is mocked
 * (no real SMTP) and the plaintext code is captured via the test-only
 * __testCode field on the start return value.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 4.3 and 6
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

vi.mock('../../../src/services/email/email-otp-email.service', () => ({
  sendEmailOtpMessage: vi.fn().mockResolvedValue(undefined),
}));

import { startEmailOtp, verifyEmailOtp } from '../../../src/services/auth/email-otp.service';
import { sendEmailOtpMessage } from '../../../src/services/email/email-otp-email.service';

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
  await db.collection('emailOtpChallenges').deleteMany({});
  await db.collection('walletRateLimits').deleteMany({});
  vi.clearAllMocks();
});

describe('email OTP', () => {
  it('start + verify happy path with the same code', async () => {
    const r = await startEmailOtp(db, {
      email: 'A@B.com',
      ip: '1.1.1.1',
      signupTicketId: null,
    });
    expect(r.challengeId).toMatch(/^[a-f0-9]{24}$/);
    expect(r.__testCode).toMatch(/^\d{6}$/);
    expect(sendEmailOtpMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.com', code: r.__testCode }),
    );
    const out = await verifyEmailOtp(db, { challengeId: r.challengeId, code: r.__testCode! });
    expect(out.email).toBe('a@b.com');
  });

  it('rate-limits a second send inside 30 seconds', async () => {
    await startEmailOtp(db, { email: 'a@b.com', ip: '1.1.1.1', signupTicketId: null });
    await expect(
      startEmailOtp(db, { email: 'a@b.com', ip: '1.1.1.1', signupTicketId: null }),
    ).rejects.toThrow(/rate_limited/);
  });

  it('rejects a wrong code and locks after 5 wrong attempts', async () => {
    const r = await startEmailOtp(db, { email: 'a@b.com', ip: '1.1.1.1', signupTicketId: null });
    for (let i = 0; i < 5; i++) {
      await expect(verifyEmailOtp(db, { challengeId: r.challengeId, code: '000000' })).rejects.toThrow();
    }
    await expect(
      verifyEmailOtp(db, { challengeId: r.challengeId, code: '000000' }),
    ).rejects.toThrow(/otp_locked/);
  });

  it('rejects a malformed challengeId with otp_invalid', async () => {
    await expect(
      verifyEmailOtp(db, { challengeId: 'not-an-id', code: '123456' }),
    ).rejects.toThrow('otp_invalid');
  });
});
