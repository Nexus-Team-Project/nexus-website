/**
 * Tests for the phoneSignupTickets collection model.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 4.4
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import {
  ensurePhoneSignupTicketIndexes,
  PHONE_SIGNUP_TICKET_COLLECTION,
} from '../../../src/models/auth/phone-signup-ticket.models';

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

describe('ensurePhoneSignupTicketIndexes', () => {
  it('creates TTL on expiresAt', async () => {
    await ensurePhoneSignupTicketIndexes(db);
    const idx = await db.collection(PHONE_SIGNUP_TICKET_COLLECTION).indexes();
    expect(idx.find((i) => i.name === 'expiresAt_ttl')?.expireAfterSeconds).toBe(0);
  });
});
