/**
 * Route-level tests for the wallet magic-link endpoints: start is
 * non-enumerating (200 { ok: true } for any email) and consume claims the
 * token, resolves the identity, and returns a session. resolveWalletIdentity +
 * issueWalletSession are mocked (no Postgres needed); the email transport is
 * mocked; mongo is the shared in-memory test DB.
 * Spec: docs/superpowers/specs/2026-07-16-wallet-email-magic-link-auth-design.md
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import express from 'express';
import request from 'supertest';

let client: MongoClient;
let db: Db;

vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/email/wallet-magic-link-email.service', () => ({
  sendWalletMagicLinkMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/services/auth/wallet-identity.service', () => ({
  resolveWalletIdentity: vi.fn(async ({ email }: { email: string }) => ({
    prismaUserId: 'user_test',
    email,
    role: 'USER',
    identityCreated: true,
    phoneLinked: false,
  })),
}));
vi.mock('../../src/services/auth/session-issuer.service', () => ({
  issueWalletSession: vi.fn(async () => ({ accessToken: 'test-access-token' })),
}));

import { env } from '../../src/config/env';
import walletMagicLinkRoutes from '../../src/routes/wallet-magic-link.routes';
import { startMagicLink } from '../../src/services/auth/wallet-magic-link.service';
import { WALLET_MAGIC_LINK_COLLECTION } from '../../src/models/auth/wallet-magic-link.models';

const app = express();
app.use(express.json());
app.use('/api/v1/auth/magic-link', walletMagicLinkRoutes);

const ORIGINAL_WALLET_URL = env.WALLET_URL;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`magic_link_routes_${Date.now()}`);
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

describe('wallet magic-link routes', () => {
  it('start returns { ok: true } for any email (non-enumerating)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/magic-link/start')
      .send({ email: 'newuser@example.com', lang: 'en' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('consume creates a session for an unknown email', async () => {
    const { __testToken } = await startMagicLink(db, { email: 'fresh@example.com', ip: '1.1.1.1' });
    const res = await request(app)
      .post('/api/v1/auth/magic-link/consume')
      .send({ token: __testToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('test-access-token');
    expect(res.body.identityCreated).toBe(true);
  });

  it('consume rejects a reused token with link_invalid', async () => {
    const { __testToken } = await startMagicLink(db, { email: 'again@example.com', ip: '1.1.1.1' });
    await request(app).post('/api/v1/auth/magic-link/consume').send({ token: __testToken });
    const res = await request(app)
      .post('/api/v1/auth/magic-link/consume')
      .send({ token: __testToken });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('link_invalid');
  });
});
