/**
 * Behavioral tests for the wallet magic-link service: token issuance (hashed
 * at rest), single-use consume, expiry, and unknown-token rejection. The email
 * transport is mocked; WALLET_URL is set on the mutable env singleton for the
 * run (mirrors domain-member-invite-email.service.test.ts).
 * Spec: docs/superpowers/specs/2026-07-16-wallet-email-magic-link-auth-design.md
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

vi.mock('../../../src/services/email/wallet-magic-link-email.service', () => ({
  sendWalletMagicLinkMessage: vi.fn().mockResolvedValue(undefined),
}));

import { env } from '../../../src/config/env';
import { hashToken } from '../../../src/utils/crypto';
import { WALLET_MAGIC_LINK_COLLECTION } from '../../../src/models/auth/wallet-magic-link.models';
import { startMagicLink, consumeMagicLink } from '../../../src/services/auth/wallet-magic-link.service';

let client: MongoClient;
let db: Db;
const ORIGINAL_WALLET_URL = env.WALLET_URL;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_${Date.now()}`);
  env.WALLET_URL = 'http://localhost:8080';
});

afterAll(async () => {
  env.WALLET_URL = ORIGINAL_WALLET_URL;
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(WALLET_MAGIC_LINK_COLLECTION).deleteMany({});
  await db.collection('walletRateLimits').deleteMany({});
  vi.clearAllMocks();
});

describe('wallet-magic-link.service', () => {
  it('start stores only the sha256 hash of the token', async () => {
    const { __testToken } = await startMagicLink(db, { email: 'A@Example.com', ip: '1.1.1.1' });
    expect(__testToken).toBeTruthy();
    const doc = await db.collection(WALLET_MAGIC_LINK_COLLECTION).findOne({ email: 'a@example.com' });
    expect(doc?.tokenHash).toBe(hashToken(__testToken as string));
    // The raw token must never be stored.
    expect(JSON.stringify(doc)).not.toContain(__testToken as string);
  });

  it('start throws magic_unavailable when WALLET_URL is unset', async () => {
    env.WALLET_URL = undefined;
    await expect(startMagicLink(db, { email: 'b@example.com', ip: '1.1.1.1' })).rejects.toThrow(
      'magic_unavailable',
    );
    env.WALLET_URL = 'http://localhost:8080';
  });

  it('rate-limits a second send inside 30 seconds', async () => {
    await startMagicLink(db, { email: 'c@example.com', ip: '1.1.1.1' });
    await expect(startMagicLink(db, { email: 'c@example.com', ip: '1.1.1.1' })).rejects.toThrow(
      /rate_limited/,
    );
  });

  it('consume returns the email once, then rejects reuse (single-use)', async () => {
    const { __testToken } = await startMagicLink(db, { email: 'd@example.com', ip: '1.1.1.1' });
    const first = await consumeMagicLink(db, { token: __testToken as string });
    expect(first.email).toBe('d@example.com');
    await expect(consumeMagicLink(db, { token: __testToken as string })).rejects.toThrow(
      'link_invalid',
    );
  });

  it('consume rejects an expired link', async () => {
    const { __testToken } = await startMagicLink(db, { email: 'e@example.com', ip: '1.1.1.1' });
    await db
      .collection(WALLET_MAGIC_LINK_COLLECTION)
      .updateOne({ email: 'e@example.com' }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(consumeMagicLink(db, { token: __testToken as string })).rejects.toThrow(
      'link_invalid',
    );
  });

  it('consume rejects an unknown token', async () => {
    await expect(consumeMagicLink(db, { token: 'a'.repeat(43) })).rejects.toThrow('link_invalid');
  });
});
