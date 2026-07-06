/**
 * Tests for the onboarding phone-OTP service: Israeli-only start, verify
 * writes a verification record, has/consume lifecycle. InforU is mocked.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { MongoClient, Db } from 'mongodb';

vi.mock('../../../src/services/sms/inforu.client', () => ({
  inforuSendSms: vi.fn(),
}));

import {
  startOnboardingPhoneOtp,
  verifyOnboardingPhoneOtp,
  hasVerifiedOnboardingPhone,
  consumeVerifiedOnboardingPhone,
} from '../../../src/services/onboarding/onboarding-phone-otp.service';
import { inforuSendSms } from '../../../src/services/sms/inforu.client';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_onb_otp_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection('phoneOtpChallenges').deleteMany({});
  await db.collection('walletRateLimits').deleteMany({});
  await db.collection('onboardingPhoneVerifications').deleteMany({});
  vi.clearAllMocks();
  (inforuSendSms as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe('startOnboardingPhoneOtp', () => {
  it('rejects a non-Israeli phone with invalid_israeli_phone', async () => {
    await expect(
      startOnboardingPhoneOtp(db, { phone: '+14155551234', ip: '1.1.1.1' }),
    ).rejects.toThrow('invalid_israeli_phone');
    expect(inforuSendSms).not.toHaveBeenCalled();
  });

  it('rejects an Israeli-looking but invalid number', async () => {
    await expect(
      startOnboardingPhoneOtp(db, { phone: '+97248465858', ip: '1.1.1.1' }),
    ).rejects.toThrow('invalid_israeli_phone');
  });

  it('sends an OTP for a valid Israeli mobile', async () => {
    const r = await startOnboardingPhoneOtp(db, { phone: '+972508465858', ip: '1.1.1.1' });
    expect(r.challengeId).toMatch(/^[a-f0-9]{24}$/);
    expect(inforuSendSms).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '0508465858' }),
    );
  });
});

describe('verify + has + consume', () => {
  it('verify writes a record; has finds it; consume removes it', async () => {
    const r = await startOnboardingPhoneOtp(db, { phone: '0508465858', ip: '1.1.1.1' });
    const out = await verifyOnboardingPhoneOtp(db, {
      userId: 'user-1', challengeId: r.challengeId, code: r.__testCode!,
    });
    expect(out).toEqual({ verified: true });
    expect(await hasVerifiedOnboardingPhone(db, 'user-1', '0508465858')).toBe(true);
    expect(await hasVerifiedOnboardingPhone(db, 'user-2', '0508465858')).toBe(false);
    await consumeVerifiedOnboardingPhone(db, 'user-1', '0508465858');
    expect(await hasVerifiedOnboardingPhone(db, 'user-1', '0508465858')).toBe(false);
  });

  it('a wrong code does not write a record', async () => {
    const r = await startOnboardingPhoneOtp(db, { phone: '0508465858', ip: '1.1.1.1' });
    // 1-in-a-million collision with the real code is acceptable (same
    // convention as the existing OTP tests).
    await expect(
      verifyOnboardingPhoneOtp(db, { userId: 'user-1', challengeId: r.challengeId, code: '000000' }),
    ).rejects.toThrow('otp_invalid');
    expect(await hasVerifiedOnboardingPhone(db, 'user-1', '0508465858')).toBe(false);
  });
});
