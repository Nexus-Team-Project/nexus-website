/**
 * Tests for the wallet phone-OTP lifecycle service. The InforU client
 * is mocked - we never hit the real provider in tests.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 6 + 10.6
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { MongoClient, Db, ObjectId } from 'mongodb';

vi.mock('../../../src/services/sms/inforu.client', () => ({
  inforuSendOtp: vi.fn(),
  inforuAuthenticateOtp: vi.fn(),
}));

import {
  startPhoneOtp,
  verifyPhoneOtp,
  resendPhoneOtp,
} from '../../../src/services/auth/phone-otp.service';
import {
  inforuSendOtp,
  inforuAuthenticateOtp,
} from '../../../src/services/sms/inforu.client';

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
  await db.collection('phoneOtpChallenges').deleteMany({});
  await db.collection('walletRateLimits').deleteMany({});
  await db.collection('phoneSignupTickets').deleteMany({});
  await db.collection('nexusIdentities').deleteMany({});
  vi.clearAllMocks();
  (inforuSendOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ requestToken: 'tok-abc' });
});

describe('startPhoneOtp', () => {
  it('normalizes the phone and returns a challengeId', async () => {
    const r = await startPhoneOtp(db, { phone: '+972508465858', ip: '1.1.1.1' });
    expect(r.challengeId).toMatch(/^[a-f0-9]{24}$/);
    expect(inforuSendOtp).toHaveBeenCalledWith({ phone: '0508465858', userIp: '1.1.1.1' });
  });

  it('rate-limits a second send inside 30 seconds', async () => {
    await startPhoneOtp(db, { phone: '0508465858', ip: '1.1.1.1' });
    await expect(
      startPhoneOtp(db, { phone: '0508465858', ip: '1.1.1.1' }),
    ).rejects.toThrow(/rate_limited/);
  });

  it('rejects an invalid phone with invalid_phone', async () => {
    await expect(
      startPhoneOtp(db, { phone: 'not-a-phone', ip: '1.1.1.1' }),
    ).rejects.toThrow('invalid_phone');
  });
});

describe('verifyPhoneOtp', () => {
  it('returns mode=phone_verified + signupTicketId when phone is unknown', async () => {
    (inforuAuthenticateOtp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    const { challengeId } = await startPhoneOtp(db, { phone: '0508465858', ip: '1.1.1.1' });
    const r = await verifyPhoneOtp(db, { challengeId, code: '123456' });
    expect(r.mode).toBe('phone_verified');
    if (r.mode === 'phone_verified') {
      expect(r.signupTicketId).toMatch(/^[a-f0-9]{24}$/);
      expect(r.phone).toBe('0508465858');
    }
  });

  it('returns mode=logged_in when phone is on an existing identity', async () => {
    const identityId = new ObjectId();
    await db.collection('nexusIdentities').insertOne({
      _id: identityId,
      normalizedEmail: 'a@b.com',
      phone: '0508465858',
      prismaUserId: 'prisma-1',
    });
    (inforuAuthenticateOtp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    const { challengeId } = await startPhoneOtp(db, { phone: '0508465858', ip: '1.1.1.1' });
    const r = await verifyPhoneOtp(db, { challengeId, code: '123456' });
    expect(r.mode).toBe('logged_in');
    if (r.mode === 'logged_in') {
      expect(r.email).toBe('a@b.com');
      expect(r.prismaUserId).toBe('prisma-1');
    }
  });

  it('increments attempts on a wrong code and locks after 5 wrong attempts', async () => {
    (inforuAuthenticateOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const { challengeId } = await startPhoneOtp(db, { phone: '0508465858', ip: '1.1.1.1' });
    for (let i = 0; i < 5; i++) {
      await expect(verifyPhoneOtp(db, { challengeId, code: '000000' })).rejects.toThrow();
    }
    await expect(
      verifyPhoneOtp(db, { challengeId, code: '000000' }),
    ).rejects.toThrow(/otp_locked/);
  });

  it('rejects a malformed challengeId with otp_invalid', async () => {
    await expect(
      verifyPhoneOtp(db, { challengeId: 'not-an-id', code: '123456' }),
    ).rejects.toThrow('otp_invalid');
  });
});

describe('resendPhoneOtp', () => {
  it('reuses the same phone but creates a new challenge id', async () => {
    const first = await startPhoneOtp(db, { phone: '0508465858', ip: '1.1.1.1' });
    // bypass the 30s rate-limit so the test does not wait
    await db.collection('walletRateLimits').deleteMany({});
    const second = await resendPhoneOtp(db, { challengeId: first.challengeId, ip: '1.1.1.1' });
    expect(second.challengeId).not.toBe(first.challengeId);
  });
});
