/**
 * Wallet email-attach tests: happy path writes Prisma User.email +
 * NexusIdentity.normalizedEmail/emailVerifiedAt; email_in_use collision;
 * wrong code -> otp_invalid; expired -> otp_expired.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db, ObjectId } from 'mongodb';

let db: Db;
vi.mock('../../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../../src/services/email/email-otp-email.service', () => ({
  sendEmailOtpMessage: vi.fn().mockResolvedValue(undefined),
}));
const prismaUser = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../../../src/config/database', () => ({ prisma: { user: prismaUser } }));

import { DOMAIN_COLLECTIONS } from '../../../src/models/domain/collections';
import { EMAIL_OTP_COLLECTION } from '../../../src/models/auth/email-otp.models';
import {
  startWalletEmailAttach,
  verifyWalletEmailAttach,
  EmailAttachError,
} from '../../../src/services/wallet/wallet-email-attach.service';

let client: MongoClient;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_email_attach_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(EMAIL_OTP_COLLECTION).deleteMany({});
  await db.collection('walletRateLimits').deleteMany({});
  await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).deleteMany({});
  vi.clearAllMocks();
  prismaUser.findUnique.mockResolvedValue(null); // no other account owns the email
  prismaUser.update.mockResolvedValue({ id: 'u-1' });
  await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
    nexusIdentityId: 'id-1', normalizedEmail: 'old@x.com', authProvider: 'email_password',
    status: 'active', locale: 'he', createdAt: new Date(), updatedAt: new Date(),
  });
});

const CALLER = { nexusIdentityId: 'id-1', prismaUserId: 'u-1', ip: '1.1.1.1' };

describe('wallet email attach', () => {
  it('happy path: start + verify writes Prisma email and identity normalizedEmail', async () => {
    const start = await startWalletEmailAttach(db, { ...CALLER, email: 'New@X.com' });
    expect(start.__testCode).toMatch(/^\d{6}$/);

    const out = await verifyWalletEmailAttach(db, {
      ...CALLER, challengeId: start.challengeId, code: start.__testCode!,
    });
    expect(out.email).toBe('new@x.com');
    expect(prismaUser.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { email: 'new@x.com', emailVerified: true },
    });
    const identity = await db.collection(DOMAIN_COLLECTIONS.nexusIdentities)
      .findOne({ nexusIdentityId: 'id-1' });
    expect(identity?.normalizedEmail).toBe('new@x.com');
    expect(identity?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('rejects email_in_use when another identity owns the email', async () => {
    await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
      nexusIdentityId: 'id-other', normalizedEmail: 'taken@x.com', authProvider: 'google',
      status: 'active', locale: 'he', createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(
      startWalletEmailAttach(db, { ...CALLER, email: 'taken@x.com' }),
    ).rejects.toThrow(EmailAttachError);
  });

  it('rejects email_in_use when another Prisma user owns the email', async () => {
    prismaUser.findUnique.mockResolvedValue({ id: 'someone-else' });
    await expect(
      startWalletEmailAttach(db, { ...CALLER, email: 'new@x.com' }),
    ).rejects.toMatchObject({ code: 'email_in_use' });
  });

  it('wrong code -> otp_invalid; expired challenge -> otp_expired', async () => {
    const start = await startWalletEmailAttach(db, { ...CALLER, email: 'new@x.com' });
    await expect(
      verifyWalletEmailAttach(db, { ...CALLER, challengeId: start.challengeId, code: '000000' }),
    ).rejects.toThrow('otp_invalid');

    await db.collection(EMAIL_OTP_COLLECTION).updateOne(
      { _id: new ObjectId(start.challengeId) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    await expect(
      verifyWalletEmailAttach(db, { ...CALLER, challengeId: start.challengeId, code: start.__testCode! }),
    ).rejects.toThrow('otp_expired');
  });
});
