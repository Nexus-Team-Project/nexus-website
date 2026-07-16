/**
 * Enqueue tests for service outreach: rejects a non-active serviceKey,
 * creates a kind-discriminated job + items matching the targeting query,
 * stamps per-item identifiers by channel, and reports flat totals. Also
 * proves getInviteJobStatus reads an outreach job (the generic /tenant/jobs
 * alias reuses it unchanged).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/domain-member.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireMemberManagementAccess: vi.fn(async () => ({ tenantId: 't1', managerIdentityId: 'mgr1' })),
}));

import { enqueueServiceOutreach } from '../../src/services/tenant-outreach.service';
import { getInviteJobStatus } from '../../src/services/member-invite-job.service';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';

let client: MongoClient;
const now = new Date();

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`outreach_enqueue_${Date.now()}`);
});
afterAll(async () => { await db.dropDatabase(); await client.close(); });

beforeEach(async () => {
  for (const c of [DOMAIN_COLLECTIONS.tenantContacts, DOMAIN_COLLECTIONS.tenantServiceActivations,
    DOMAIN_COLLECTIONS.domainTenants, 'memberInviteJobs', 'memberInviteJobItems']) {
    await db.collection(c).deleteMany({});
  }
  await db.collection(DOMAIN_COLLECTIONS.domainTenants).insertOne({
    tenantId: 't1', organizationName: 'Acme', status: 'active', plan: 'basic', createdAt: now, updatedAt: now,
  });
  await db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).insertOne({
    tenantServiceActivationId: 'a1', tenantId: 't1', serviceKey: 'benefits_catalog',
    status: 'active', createdAt: now, updatedAt: now,
  });
  await db.collection(DOMAIN_COLLECTIONS.tenantContacts).insertMany([
    { tenantContactId: 'c_phone', tenantId: 't1', displayName: 'P', status: 'inactive', phone: '0501111111', createdAt: now, updatedAt: now },
    { tenantContactId: 'c_email', tenantId: 't1', displayName: 'E', status: 'inactive', email: 'e@x.com', normalizedEmail: 'e@x.com', createdAt: now, updatedAt: now },
    { tenantContactId: 'c_none', tenantId: 't1', displayName: 'N', status: 'inactive', createdAt: now, updatedAt: now },
    { tenantContactId: 'c_invited', tenantId: 't1', displayName: 'I', status: 'inactive', phone: '0502222222',
      serviceInvites: { benefits_catalog: { lastSentAt: now, channels: ['sms'] } }, createdAt: now, updatedAt: now },
  ]);
});

const input = (over: Record<string, unknown> = {}) => ({
  serviceKey: 'benefits_catalog' as const, channel: 'both' as const,
  resendAlreadyInvited: false, language: 'he' as const, ...over,
});

describe('enqueueServiceOutreach', () => {
  it('rejects a serviceKey that is not ACTIVE for the tenant with 403', async () => {
    await expect(enqueueServiceOutreach('u1', input({ serviceKey: 'digital_wallet' })))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('creates a kind-stamped job + one item per targeted contact', async () => {
    const result = await enqueueServiceOutreach('u1', input());
    expect(result.totals).toEqual({ willSend: 2, skipped: 1, alreadyInvitedIncluded: 0 });

    const job = await db.collection('memberInviteJobs').findOne({ jobId: result.jobId });
    expect(job).toMatchObject({
      kind: 'service_outreach', serviceKey: 'benefits_catalog', tenantId: 't1',
      totalCount: 2, sentCount: 0, failedCount: 0, status: 'queued', language: 'he',
    });

    const items = await db.collection('memberInviteJobItems').find({ jobId: result.jobId }).toArray();
    expect(items).toHaveLength(2);
    const byContact = new Map(items.map((i) => [i.contactId, i]));
    expect(byContact.get('c_phone')).toMatchObject({
      kind: 'service_outreach', channel: 'both', phone: '0501111111', tenantName: 'Acme', status: 'queued',
    });
    expect(byContact.get('c_phone')!.email).toBeUndefined();
    expect(byContact.get('c_email')).toMatchObject({ email: 'e@x.com' });
    expect(byContact.get('c_email')!.phone).toBeUndefined();
  });

  it('resendAlreadyInvited folds invited contacts in and reports them', async () => {
    const result = await enqueueServiceOutreach('u1', input({ resendAlreadyInvited: true }));
    expect(result.totals).toEqual({ willSend: 3, skipped: 1, alreadyInvitedIncluded: 1 });
  });

  it('sms channel targets only phone holders and strips email from items', async () => {
    const result = await enqueueServiceOutreach('u1', input({ channel: 'sms' }));
    expect(result.totals.willSend).toBe(1);
    const items = await db.collection('memberInviteJobItems').find({ jobId: result.jobId }).toArray();
    expect(items[0]).toMatchObject({ contactId: 'c_phone', phone: '0501111111' });
    expect(items[0]!.email).toBeUndefined();
  });

  it('getInviteJobStatus reads an outreach job (generic alias is kind-agnostic)', async () => {
    const { jobId } = await enqueueServiceOutreach('u1', input());
    const status = await getInviteJobStatus('t1', jobId);
    expect(status).toMatchObject({ jobId, status: 'queued', totalCount: 2, sentCount: 0, failedCount: 0 });
  });

  it('zero targets creates an immediately completed job', async () => {
    await db.collection(DOMAIN_COLLECTIONS.tenantContacts).deleteMany({});
    const result = await enqueueServiceOutreach('u1', input());
    expect(result.totals.willSend).toBe(0);
    const job = await db.collection('memberInviteJobs').findOne({ jobId: result.jobId });
    expect(job!.status).toBe('completed');
  });
});
