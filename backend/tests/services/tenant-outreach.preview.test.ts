/**
 * Preview facet matrix for service outreach targeting:
 * channel (sms/email/both) x identifier presence x already-invited x resend.
 * Targeting = tenantId match, status !== 'active', channel identifier
 * present, and (unless resend) serviceInvites.<key>.lastSentAt absent.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/domain-member.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireMemberManagementAccess: vi.fn(async () => ({ tenantId: 't1', managerIdentityId: 'mgr1' })),
}));

import { previewServiceOutreach } from '../../src/services/tenant-outreach.service';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';

let client: MongoClient;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`outreach_preview_${Date.now()}`);
});
afterAll(async () => { await db.dropDatabase(); await client.close(); });

const now = new Date();
const contact = (id: string, over: Record<string, unknown>) => ({
  tenantContactId: id, tenantId: 't1', displayName: id, status: 'inactive',
  createdAt: now, updatedAt: now, ...over,
});

beforeEach(async () => {
  const col = db.collection(DOMAIN_COLLECTIONS.tenantContacts);
  await col.deleteMany({});
  await col.insertMany([
    // Registered - excluded from EVERY count.
    contact('c_active', { status: 'active', phone: '0501111111', email: 'act@x.com', normalizedEmail: 'act@x.com' }),
    contact('c_phone', { phone: '0502222222' }),
    contact('c_email', { email: 'e@x.com', normalizedEmail: 'e@x.com' }),
    contact('c_both', { phone: '0503333333', email: 'b@x.com', normalizedEmail: 'b@x.com' }),
    contact('c_none', {}),
    contact('c_invited', {
      phone: '0504444444', email: 'i@x.com', normalizedEmail: 'i@x.com',
      serviceInvites: { benefits_catalog: { lastSentAt: now, channels: ['sms'] } },
    }),
    // Other tenant - never counted.
    { ...contact('c_other', { phone: '0505555555' }), tenantId: 't2' },
  ]);
});

const input = (over: Record<string, unknown> = {}) => ({
  serviceKey: 'benefits_catalog' as const, channel: 'sms' as const, resendAlreadyInvited: false, ...over,
});

describe('previewServiceOutreach', () => {
  it('sms, no resend: counts phone holders, skips no-phone, excludes invited', async () => {
    expect(await previewServiceOutreach('u1', input())).toEqual({
      willSend: 2, skippedNoPhone: 2, skippedNoEmail: 0, skippedNoIdentifier: 0, alreadyInvited: 1,
    });
  });

  it('sms, resend: folds the invited contact back into willSend', async () => {
    const counts = await previewServiceOutreach('u1', input({ resendAlreadyInvited: true }));
    expect(counts.willSend).toBe(3);
    expect(counts.alreadyInvited).toBe(1);
  });

  it('email, no resend: counts email holders, skips no-email', async () => {
    expect(await previewServiceOutreach('u1', input({ channel: 'email' }))).toEqual({
      willSend: 2, skippedNoPhone: 0, skippedNoEmail: 2, skippedNoIdentifier: 0, alreadyInvited: 1,
    });
  });

  it('both, no resend: skips only contacts with NEITHER identifier', async () => {
    expect(await previewServiceOutreach('u1', input({ channel: 'both' }))).toEqual({
      willSend: 3, skippedNoPhone: 0, skippedNoEmail: 0, skippedNoIdentifier: 1, alreadyInvited: 1,
    });
  });
});
