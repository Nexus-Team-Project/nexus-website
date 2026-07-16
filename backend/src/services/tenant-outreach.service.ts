/**
 * Service-outreach targeting: preview counts and job enqueue for the
 * Members-page "invite to service" blast. Targeting = the tenant's contacts
 * that are not yet registered (status !== 'active'), filtered by identifier
 * presence for the chosen channel, and excluding contacts already stamped
 * serviceInvites.<serviceKey> unless resendAlreadyInvited is set.
 * Gate: team.invite_member (requireMemberManagementAccess), the same
 * permission invite creation uses.
 */
import { randomUUID } from 'crypto';
import type { ObjectId } from 'mongodb';
import { getMongoDb } from '../config/mongo';
import { createError } from '../middleware/errorHandler';
import { getTenantDomainCollections } from '../models/domain';
import {
  getInviteJobCollections,
  type MemberInviteJob,
  type OutreachChannel,
  type ServiceOutreachJobItem,
} from '../models/domain/invite-jobs.models';
import { requireMemberManagementAccess } from './domain-member.service';
import type { OutreachEnqueueInput, OutreachPreviewInput } from '../schemas/tenant-outreach.schemas';

/** Flat counts object returned by the preview endpoint (never nested). */
export interface OutreachPreviewCounts {
  willSend: number;
  skippedNoPhone: number;
  skippedNoEmail: number;
  skippedNoIdentifier: number;
  alreadyInvited: number;
}

/** Page size for the enqueue _id cursor over the targeting query. */
const ENQUEUE_PAGE_SIZE = 500;

/** Response for POST /tenant/contacts/outreach. */
export interface EnqueueOutreachResponse {
  jobId: string;
  totals: { willSend: number; skipped: number; alreadyInvitedIncluded: number };
}

/**
 * Builds the identifier-presence clause for a channel.
 * Input: outreach channel. Output: Mongo filter fragment.
 * 'both' requires at least one identifier (skips only contacts with neither).
 */
function identifierMatch(channel: OutreachChannel): Record<string, unknown> {
  if (channel === 'sms') return { phone: { $exists: true } };
  if (channel === 'email') return { normalizedEmail: { $exists: true } };
  return { $or: [{ phone: { $exists: true } }, { normalizedEmail: { $exists: true } }] };
}

/**
 * The exact filter the enqueue cursor re-runs: who WILL receive this run.
 * Input: tenant id + validated preview input. Output: full Mongo filter.
 * serviceKey comes from the SERVICE_KEYS Zod enum, so the dot path is safe.
 */
export function buildWillSendFilter(
  tenantId: string,
  input: OutreachPreviewInput,
): Record<string, unknown> {
  const invitedPath = `serviceInvites.${input.serviceKey}.lastSentAt`;
  return {
    tenantId,
    status: { $ne: 'active' },
    ...identifierMatch(input.channel),
    ...(input.resendAlreadyInvited ? {} : { [invitedPath]: { $exists: false } }),
  };
}

/**
 * Computes all preview counts in ONE $facet aggregation over the tenant's
 * non-registered contacts. Input: tenant id + validated input.
 * Output: flat counts (irrelevant skip buckets are 0 for the channel).
 */
export async function computeOutreachCounts(
  tenantId: string,
  input: OutreachPreviewInput,
): Promise<OutreachPreviewCounts> {
  const db = await getMongoDb();
  const col = getTenantDomainCollections(db).tenantContacts;
  const invitedPath = `serviceInvites.${input.serviceKey}.lastSentAt`;
  const idMatch = identifierMatch(input.channel);

  const facet: Record<string, object[]> = {
    willSend: [
      { $match: { ...idMatch, ...(input.resendAlreadyInvited ? {} : { [invitedPath]: { $exists: false } }) } },
      { $count: 'n' },
    ],
    alreadyInvited: [{ $match: { ...idMatch, [invitedPath]: { $exists: true } } }, { $count: 'n' }],
  };
  if (input.channel === 'sms') {
    facet.skippedNoPhone = [{ $match: { phone: { $exists: false } } }, { $count: 'n' }];
  }
  if (input.channel === 'email') {
    facet.skippedNoEmail = [{ $match: { normalizedEmail: { $exists: false } } }, { $count: 'n' }];
  }
  if (input.channel === 'both') {
    facet.skippedNoIdentifier = [
      { $match: { phone: { $exists: false }, normalizedEmail: { $exists: false } } },
      { $count: 'n' },
    ];
  }

  const [row] = await col
    .aggregate<Record<string, { n: number }[]>>([
      { $match: { tenantId, status: { $ne: 'active' } } },
      { $facet: facet },
    ])
    .toArray();
  const count = (key: string): number => row?.[key]?.[0]?.n ?? 0;
  return {
    willSend: count('willSend'),
    skippedNoPhone: count('skippedNoPhone'),
    skippedNoEmail: count('skippedNoEmail'),
    skippedNoIdentifier: count('skippedNoIdentifier'),
    alreadyInvited: count('alreadyInvited'),
  };
}

/**
 * Permission-gated preview entry point for the route.
 * Input: manager Prisma user id + validated body. Output: flat counts.
 * Errors: 403 when the caller lacks team.invite_member.
 */
export async function previewServiceOutreach(
  userId: string,
  input: OutreachPreviewInput,
): Promise<OutreachPreviewCounts> {
  const access = await requireMemberManagementAccess(userId);
  return computeOutreachCounts(access.tenantId, input);
}

/**
 * Validates the service is ACTIVE, snapshots targeting counts, and enqueues
 * one service_outreach job with one item per targeted contact.
 * Items are collected via a paginated _id cursor (small projected docs, so
 * holding one run in memory is fine at contact-list scale); the job document
 * is inserted BEFORE the items so worker counter updates always find it.
 * Input: manager Prisma user id + validated enqueue body.
 * Output: { jobId, totals } for the dashboard progress modal.
 * Errors: 403 service_not_active when the serviceKey has no active
 *         activation; 404 when the tenant document is missing.
 */
export async function enqueueServiceOutreach(
  userId: string,
  input: OutreachEnqueueInput,
): Promise<EnqueueOutreachResponse> {
  const access = await requireMemberManagementAccess(userId);
  const db = await getMongoDb();
  const tenants = getTenantDomainCollections(db);

  const activation = await tenants.tenantServiceActivations.findOne({
    tenantId: access.tenantId, serviceKey: input.serviceKey, status: 'active',
  });
  if (!activation) throw createError('service_not_active', 403);

  const tenant = await tenants.domainTenants.findOne(
    { tenantId: access.tenantId },
    { projection: { organizationName: 1 } },
  );
  if (!tenant) throw createError('Tenant not found', 404);

  const counts = await computeOutreachCounts(access.tenantId, input);
  const now = new Date();
  const jobId = `service_outreach_job_${randomUUID()}`;
  const wantsSms = input.channel !== 'email';
  const wantsEmail = input.channel !== 'sms';

  const items: ServiceOutreachJobItem[] = [];
  let lastId: ObjectId | undefined;
  for (;;) {
    const page = await tenants.tenantContacts
      .find({ ...buildWillSendFilter(access.tenantId, input), ...(lastId ? { _id: { $gt: lastId } } : {}) })
      .sort({ _id: 1 })
      .limit(ENQUEUE_PAGE_SIZE)
      .project<{ _id: ObjectId; tenantContactId: string; phone?: string; normalizedEmail?: string }>(
        { tenantContactId: 1, phone: 1, normalizedEmail: 1 },
      )
      .toArray();
    if (page.length === 0) break;
    lastId = page[page.length - 1]._id;
    for (const contactRow of page) {
      items.push({
        jobItemId: `service_outreach_job_item_${randomUUID()}`,
        jobId,
        tenantId: access.tenantId,
        kind: 'service_outreach',
        serviceKey: input.serviceKey,
        tenantName: tenant.organizationName,
        contactId: contactRow.tenantContactId,
        ...(wantsSms && contactRow.phone ? { phone: contactRow.phone } : {}),
        ...(wantsEmail && contactRow.normalizedEmail ? { email: contactRow.normalizedEmail } : {}),
        channel: input.channel,
        language: input.language,
        status: 'queued',
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (page.length < ENQUEUE_PAGE_SIZE) break;
  }

  const { memberInviteJobs, memberInviteJobItems } = getInviteJobCollections(db);
  const job: MemberInviteJob = {
    jobId,
    tenantId: access.tenantId,
    actorIdentityId: access.managerIdentityId,
    kind: 'service_outreach',
    serviceKey: input.serviceKey,
    totalCount: items.length,
    sentCount: 0,
    failedCount: 0,
    skippedCount: counts.skippedNoPhone + counts.skippedNoEmail + counts.skippedNoIdentifier,
    status: items.length === 0 ? 'completed' : 'queued',
    language: input.language,
    createdAt: now,
    updatedAt: now,
    ...(items.length === 0 ? { completedAt: now } : {}),
  };
  await memberInviteJobs.insertOne(job);
  if (items.length > 0) await memberInviteJobItems.insertMany(items, { ordered: false });

  return {
    jobId,
    totals: {
      willSend: items.length,
      skipped: counts.skippedNoPhone + counts.skippedNoEmail + counts.skippedNoIdentifier,
      alreadyInvitedIncluded: input.resendAlreadyInvited ? counts.alreadyInvited : 0,
    },
  };
}
