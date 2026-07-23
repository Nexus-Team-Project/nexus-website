/**
 * Tests for the public GET /l/:code redirect route: 302 with DB-sourced
 * Location, 404 for unknown codes, fire-and-forget click increment.
 * Spec: docs/superpowers/specs/2026-07-15-members-service-invite-design.md s.3, s.8
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import express from 'express';
import request from 'supertest';

vi.hoisted(() => {
  process.env.BACKEND_URL = 'https://api.test.local';
});

let client: MongoClient;
let db: Db;

vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import shortLinkRoutes from '../../src/routes/short-link.routes';
import { SHORT_LINK_COLLECTION } from '../../src/models/domain/short-links.models';

const app = express();
app.use('/l', shortLinkRoutes);

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`short_link_routes_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(SHORT_LINK_COLLECTION).deleteMany({});
  await db.collection(SHORT_LINK_COLLECTION).insertOne({
    code: 'abc1234',
    targetUrl: 'https://wallet.example/?tenant=t1',
    tenantId: 't1',
    serviceKey: 'benefits_catalog',
    clicks: 0,
    createdAt: new Date(),
  });
});

describe('GET /l/:code', () => {
  it('302-redirects a known code to its stored target', async () => {
    const res = await request(app).get('/l/abc1234');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://wallet.example/?tenant=t1');
  });

  it('404s an unknown code', async () => {
    const res = await request(app).get('/l/zzzz999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('404s a malformed code without touching the DB shape', async () => {
    const res = await request(app).get('/l/toolongcode12345');
    expect(res.status).toBe(404);
  });

  it('increments clicks fire-and-forget', async () => {
    await request(app).get('/l/abc1234');
    await vi.waitFor(async () => {
      const doc = await db.collection(SHORT_LINK_COLLECTION).findOne({ code: 'abc1234' });
      expect(doc?.clicks).toBe(1);
    });
  });
});
