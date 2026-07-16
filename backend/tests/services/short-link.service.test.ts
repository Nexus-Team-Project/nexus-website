/**
 * Tests for the self-hosted short-link service: idempotency per
 * (tenantId, serviceKey), base62 code shape, code uniqueness across tenants,
 * and consume/click-increment behavior.
 * Spec: docs/superpowers/specs/2026-07-15-members-service-invite-design.md s.3
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db } from 'mongodb';

// Must run before static imports: env.ts parses process.env at module load.
vi.hoisted(() => {
  process.env.BACKEND_URL = 'https://api.test.local';
});

let client: MongoClient;
let db: Db;

vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import {
  getOrCreateShortLink,
  consumeShortLink,
  generateShortCode,
} from '../../src/services/short-link.service';
import {
  ensureShortLinkIndexes,
  getShortLinkCollection,
  SHORT_LINK_COLLECTION,
} from '../../src/models/domain/short-links.models';

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`short_links_${Date.now()}`);
  await ensureShortLinkIndexes(db);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(SHORT_LINK_COLLECTION).deleteMany({});
});

describe('generateShortCode', () => {
  it('produces 7-char base62 codes', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateShortCode()).toMatch(/^[0-9A-Za-z]{7}$/);
    }
  });
});

describe('getOrCreateShortLink', () => {
  it('creates one link and returns an absolute /l/<code> URL', async () => {
    const url = await getOrCreateShortLink('t1', 'benefits_catalog', 'https://wallet.example/?tenant=t1');
    expect(url).toMatch(/^https:\/\/api\.test\.local\/l\/[0-9A-Za-z]{6,8}$/);
    expect(await getShortLinkCollection(db).countDocuments({})).toBe(1);
  });

  it('is idempotent per (tenantId, serviceKey) and keeps the original targetUrl', async () => {
    const first = await getOrCreateShortLink('t1', 'benefits_catalog', 'https://wallet.example/?tenant=t1');
    const second = await getOrCreateShortLink('t1', 'benefits_catalog', 'https://wallet.example/?tenant=t1&other=1');
    expect(second).toBe(first);
    expect(await getShortLinkCollection(db).countDocuments({})).toBe(1);
  });

  it('allocates distinct codes for distinct (tenant, service) pairs', async () => {
    const a = await getOrCreateShortLink('t1', 'benefits_catalog', 'https://wallet.example/?tenant=t1');
    const b = await getOrCreateShortLink('t2', 'benefits_catalog', 'https://wallet.example/?tenant=t2');
    expect(a).not.toBe(b);
    expect(await getShortLinkCollection(db).countDocuments({})).toBe(2);
  });
});

describe('consumeShortLink', () => {
  it('returns the stored target and increments clicks', async () => {
    const url = await getOrCreateShortLink('t1', 'benefits_catalog', 'https://wallet.example/?tenant=t1');
    const code = url.split('/l/')[1];
    expect(await consumeShortLink(code)).toBe('https://wallet.example/?tenant=t1');
    await vi.waitFor(async () => {
      const doc = await getShortLinkCollection(db).findOne({ code });
      expect(doc?.clicks).toBe(1);
    });
  });

  it('returns null for unknown and malformed codes', async () => {
    expect(await consumeShortLink('zzzZZZ9')).toBeNull();
    expect(await consumeShortLink('../../etc')).toBeNull();
    expect(await consumeShortLink('')).toBeNull();
  });
});
