/**
 * Worker kind-dispatch tests: a service_outreach item sends InforU SMS
 * and/or the outreach email via the tenant short link, records per-channel
 * outcome on the item, and stamps the contact's serviceInvites map; a
 * member_invite item (no kind) still goes through the invite email path
 * untouched. External providers and the short-link service are mocked.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/sms/inforu.client', () => ({ inforuSendSms: vi.fn(async () => {}) }));
vi.mock('../../src/services/email/service-outreach-email.service', () => ({
  sendServiceOutreachEmail: vi.fn(async () => 'msg_out_1'),
}));
vi.mock('../../src/services/short-link.service', () => ({
  getOrCreateShortLink: vi.fn(async () => 'https://nxs.example/l/abc123'),
}));
vi.mock('../../src/services/domain-member-invite-email.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sendTenantMemberInviteEmail: vi.fn(async () => 'msg_inv_1'),
}));

import { processClaimedItem } from '../../src/jobs/member-invite-worker';
import { inforuSendSms } from '../../src/services/sms/inforu.client';
import { sendServiceOutreachEmail } from '../../src/services/email/service-outreach-email.service';
import { sendTenantMemberInviteEmail } from '../../src/services/domain-member-invite-email.service';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';
import type { InviteJobItem, ServiceOutreachJobItem } from '../../src/models/domain/invite-jobs.models';

const mockedSms = vi.mocked(inforuSendSms);
const mockedOutreachMail = vi.mocked(sendServiceOutreachEmail);
const mockedInviteMail = vi.mocked(sendTenantMemberInviteEmail);

let client: MongoClient;
const now = new Date();

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`worker_dispatch_${Date.now()}`);
});
afterAll(async () => { await db.dropDatabase(); await client.close(); });

beforeEach(async () => {
  vi.clearAllMocks();
  for (const c of [DOMAIN_COLLECTIONS.tenantContacts, DOMAIN_COLLECTIONS.tenantMemberInvitations,
    'memberInviteJobItems']) {
    await db.collection(c).deleteMany({});
  }
  await db.collection(DOMAIN_COLLECTIONS.tenantContacts).insertOne({
    tenantContactId: 'c1', tenantId: 't1', displayName: 'A', status: 'inactive',
    phone: '0501111111', email: 'a@b.com', normalizedEmail: 'a@b.com', createdAt: now, updatedAt: now,
  });
});

const outreachItem = (over: Partial<ServiceOutreachJobItem> = {}): ServiceOutreachJobItem => ({
  jobItemId: 'oi1', jobId: 'oj1', tenantId: 't1', kind: 'service_outreach',
  serviceKey: 'benefits_catalog', tenantName: 'Acme', contactId: 'c1',
  phone: '0501111111', email: 'a@b.com', channel: 'both', language: 'he',
  status: 'processing', attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now, ...over,
});

describe('processClaimedItem - service_outreach', () => {
  it('sends SMS + email via the short link and stamps the contact', async () => {
    await db.collection('memberInviteJobItems').insertOne(outreachItem());
    await processClaimedItem(outreachItem());

    expect(mockedSms).toHaveBeenCalledTimes(1);
    const smsArgs = mockedSms.mock.calls[0][0];
    expect(smsArgs.phone).toBe('0501111111');
    expect(smsArgs.message).toContain('Acme');
    expect(smsArgs.message).toContain('https://nxs.example/l/abc123');
    expect(mockedOutreachMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.com', ctaUrl: 'https://nxs.example/l/abc123', language: 'he' }),
    );

    const item = await db.collection('memberInviteJobItems').findOne({ jobItemId: 'oi1' });
    expect(item!.sentChannels).toEqual(['sms', 'email']);

    const contact = await db.collection(DOMAIN_COLLECTIONS.tenantContacts).findOne({ tenantContactId: 'c1' });
    expect(contact!.serviceInvites.benefits_catalog.channels).toEqual(['sms', 'email']);
    expect(contact!.serviceInvites.benefits_catalog.lastSentAt).toBeInstanceOf(Date);
  });

  it('both channel: SMS failure still succeeds via email and records the sms error', async () => {
    mockedSms.mockRejectedValueOnce(new Error('inforu_send_status_7'));
    await db.collection('memberInviteJobItems').insertOne(outreachItem());
    await processClaimedItem(outreachItem());

    const item = await db.collection('memberInviteJobItems').findOne({ jobItemId: 'oi1' });
    expect(item!.sentChannels).toEqual(['email']);
    expect(item!.channelErrors.sms).toBe('inforu_send_status_7');

    const contact = await db.collection(DOMAIN_COLLECTIONS.tenantContacts).findOne({ tenantContactId: 'c1' });
    expect(contact!.serviceInvites.benefits_catalog.channels).toEqual(['email']);
  });

  it('throws (item retried) and does NOT stamp when every channel fails', async () => {
    mockedSms.mockRejectedValueOnce(new Error('inforu_network_error'));
    mockedOutreachMail.mockRejectedValueOnce(new Error('smtp_down'));
    await db.collection('memberInviteJobItems').insertOne(outreachItem());
    await expect(processClaimedItem(outreachItem())).rejects.toThrow();

    const contact = await db.collection(DOMAIN_COLLECTIONS.tenantContacts).findOne({ tenantContactId: 'c1' });
    expect(contact!.serviceInvites).toBeUndefined();
  });

  it('sms-only item never calls the email sender', async () => {
    const item = outreachItem({ channel: 'sms', email: undefined });
    await db.collection('memberInviteJobItems').insertOne(item);
    await processClaimedItem(item);
    expect(mockedOutreachMail).not.toHaveBeenCalled();
    expect(mockedSms).toHaveBeenCalledTimes(1);
  });
});

describe('processClaimedItem - member_invite (untouched)', () => {
  it('kind-less item goes through the invite email path, no SMS, no stamp', async () => {
    await db.collection(DOMAIN_COLLECTIONS.tenantMemberInvitations).insertOne({
      tenantMemberInvitationId: 'inv1', tenantId: 't1', createdAt: now, updatedAt: now,
    });
    const inviteItem = {
      jobItemId: 'ii1', jobId: 'ij1', tenantId: 't1', invitationId: 'inv1',
      email: 'a@b.com', language: 'he', tenantName: 'Acme', roles: ['member'],
      services: [], rawToken: 'tok', expiresAt: new Date(Date.now() + 86400000),
      status: 'processing', attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now,
    } as InviteJobItem;
    await processClaimedItem(inviteItem);

    expect(mockedInviteMail).toHaveBeenCalledTimes(1);
    expect(mockedSms).not.toHaveBeenCalled();
    expect(mockedOutreachMail).not.toHaveBeenCalled();
    const invitation = await db.collection(DOMAIN_COLLECTIONS.tenantMemberInvitations)
      .findOne({ tenantMemberInvitationId: 'inv1' });
    expect(invitation!.lastEmailSentAt).toBeInstanceOf(Date);
    const contact = await db.collection(DOMAIN_COLLECTIONS.tenantContacts).findOne({ tenantContactId: 'c1' });
    expect(contact!.serviceInvites).toBeUndefined();
  });
});
