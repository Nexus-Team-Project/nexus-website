/**
 * Defines Mongo-backed job and job-item documents for asynchronous bulk
 * member invitations. The job collection tracks aggregate progress for a
 * single submit; the job-item collection holds one row per invite and
 * carries the data the worker needs to send the email (raw token, recipient,
 * language, tenant name). Items use atomic findOneAndUpdate to claim work
 * without a separate queue service.
 */
import type { Collection, Db } from 'mongodb';
import type { TenantServiceKey } from './tenant.models';

/** Aggregate status for a member invite job. */
export type MemberInviteJobStatus = 'queued' | 'processing' | 'completed';

/** Lifecycle status for an individual invite item processed by the worker. */
export type MemberInviteJobItemStatus = 'queued' | 'processing' | 'sent' | 'failed';

/** Discriminates the two work kinds sharing the invite job queue.
 *  Absent on a document = 'member_invite' (pre-outreach back-compat). */
export type InviteJobKind = 'member_invite' | 'service_outreach';

/** Channels a service-outreach run may use. */
export const OUTREACH_CHANNELS = ['sms', 'email', 'both'] as const;
export type OutreachChannel = typeof OUTREACH_CHANNELS[number];

/**
 * One job per chunk submitted to the bulk-async invite route.
 * Counters are bumped atomically as items finish so the dashboard can poll
 * progress without scanning items.
 */
export interface MemberInviteJob {
  jobId: string;
  tenantId: string;
  actorIdentityId: string;
  /** Absent = member_invite (back-compat with pre-outreach documents). */
  kind?: InviteJobKind;
  /** Set only on service_outreach jobs: the invited-to service. */
  serviceKey?: TenantServiceKey;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  status: MemberInviteJobStatus;
  language: 'he' | 'en';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * One item per email the worker has to deliver.
 * rawToken is required so the worker can build the accept URL; it is wiped
 * once the email is sent so the document carries no live secret long-term.
 */
export interface MemberInviteJobItem {
  jobItemId: string;
  jobId: string;
  tenantId: string;
  /** Absent = member_invite (back-compat with pre-outreach documents). */
  kind?: 'member_invite';
  invitationId: string;
  email: string;
  language: 'he' | 'en';
  tenantName: string;
  displayName?: string;
  roles: string[];
  services: string[];
  rawToken?: string;
  expiresAt: Date;
  status: MemberInviteJobItemStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastError?: string;
  claimedAt?: Date;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One item per contact in a service-outreach blast. Carries only what the
 * worker needs to send: identifiers for the chosen channel, the tenant's
 * display name for the message text, and the target service key.
 */
export interface ServiceOutreachJobItem {
  jobItemId: string;
  jobId: string;
  tenantId: string;
  kind: 'service_outreach';
  serviceKey: TenantServiceKey;
  tenantName: string;
  contactId: string;
  phone?: string;
  email?: string;
  channel: OutreachChannel;
  language: 'he' | 'en';
  /** Channels actually delivered on the last attempt (per-channel outcome). */
  sentChannels?: ('sms' | 'email')[];
  /** Per-channel provider error from the last attempt, when a channel failed. */
  channelErrors?: { sms?: string; email?: string };
  status: MemberInviteJobItemStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastError?: string;
  claimedAt?: Date;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Union stored in the memberInviteJobItems collection, discriminated by kind. */
export type InviteJobItem = MemberInviteJobItem | ServiceOutreachJobItem;

/** Mongo collection accessors for invite jobs and items. */
export interface InviteJobCollections {
  memberInviteJobs: Collection<MemberInviteJob>;
  memberInviteJobItems: Collection<InviteJobItem>;
}

/**
 * Returns typed Mongo collections for the invite-job model.
 * Input: open Mongo database handle.
 * Output: collections used by the job service and worker.
 */
export function getInviteJobCollections(db: Db): InviteJobCollections {
  return {
    memberInviteJobs: db.collection<MemberInviteJob>('memberInviteJobs'),
    memberInviteJobItems: db.collection<InviteJobItem>('memberInviteJobItems'),
  };
}

/**
 * Creates idempotent indexes for invite job and job-item collections.
 * Input: Mongo database handle.
 * Output: indexes exist so the worker can claim, the API can poll, and
 *         completed records expire after 30 days.
 */
export async function ensureInviteJobIndexes(db: Db): Promise<void> {
  const { memberInviteJobs, memberInviteJobItems } = getInviteJobCollections(db);
  const THIRTY_DAYS = 30 * 24 * 60 * 60;
  await Promise.all([
    memberInviteJobs.createIndex({ jobId: 1 }, { unique: true }),
    memberInviteJobs.createIndex({ tenantId: 1, createdAt: -1 }),
    memberInviteJobs.createIndex(
      { completedAt: 1 },
      {
        name: 'memberInviteJobs_completedAt_ttl',
        expireAfterSeconds: THIRTY_DAYS,
        partialFilterExpression: { status: 'completed' },
      },
    ),
    memberInviteJobItems.createIndex({ jobItemId: 1 }, { unique: true }),
    memberInviteJobItems.createIndex({ jobId: 1, status: 1 }),
    memberInviteJobItems.createIndex({ status: 1, nextAttemptAt: 1 }),
    memberInviteJobItems.createIndex({ status: 1, claimedAt: 1 }),
    memberInviteJobItems.createIndex(
      { sentAt: 1 },
      {
        name: 'memberInviteJobItems_sentAt_ttl',
        expireAfterSeconds: THIRTY_DAYS,
        partialFilterExpression: { status: 'sent' },
      },
    ),
  ]);
}
