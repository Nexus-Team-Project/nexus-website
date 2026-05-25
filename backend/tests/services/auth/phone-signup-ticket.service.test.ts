/**
 * Tests for phone-signup-ticket lifecycle (create + atomic consume).
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 4.4
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import {
  createPhoneSignupTicket,
  consumePhoneSignupTicket,
} from '../../../src/services/auth/phone-signup-ticket.service';

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
  await db.collection('phoneSignupTickets').deleteMany({});
});

describe('phone signup tickets', () => {
  it('creates and consumes a ticket', async () => {
    const { id } = await createPhoneSignupTicket(db, '0508465858');
    const out = await consumePhoneSignupTicket(db, id);
    expect(out.phone).toBe('0508465858');
  });

  it('rejects a second consume of the same ticket', async () => {
    const { id } = await createPhoneSignupTicket(db, '0508465858');
    await consumePhoneSignupTicket(db, id);
    await expect(consumePhoneSignupTicket(db, id)).rejects.toThrow(/ticket_invalid/);
  });

  it('rejects an expired ticket', async () => {
    const { id } = await createPhoneSignupTicket(db, '0508465858', -1);
    await expect(consumePhoneSignupTicket(db, id)).rejects.toThrow(/ticket_invalid/);
  });

  it('rejects a non-ObjectId ticketId', async () => {
    await expect(consumePhoneSignupTicket(db, 'not-a-real-id')).rejects.toThrow(/ticket_invalid/);
  });
});
