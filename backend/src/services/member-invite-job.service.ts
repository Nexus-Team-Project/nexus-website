/**
 * Provides job and job-item lifecycle helpers for the asynchronous bulk
 * member-invite flow. The route enqueues a job; the worker claims items
 * atomically, marks them sent or failed, and reports aggregate progress to
 * the dashboard via getInviteJobStatus.
 */
import { randomUUID } from 'crypto';
import { getMongoDb } from '../config/mongo';
import { createError } from '../middleware/errorHandler';
import {
  getInviteJobCollections,
  type MemberInviteJob,
  type MemberInviteJobItem,
  type MemberInviteJobStatus,
} from '../models/domain/invite-jobs.models';
import type { CreatedMemberInviteRecord } from './member-invite-record.service';

/** Maximum delivery attempts before an item is permanently marked failed. */
export const MAX_INVITE_ATTEMPTS = 5;

/** Backoff schedule in milliseconds keyed by attempt number (1-based). */
const BACKOFF_MS: Record<number, number> = {
  1: 10_000,
  2: 30_000,
  3: 120_000,
  4: 600_000,
};

/** Computes the next-attempt timestamp using exponential backoff. */
function nextAttemptDelayMs(attempts: number): number {
  return BACKOFF_MS[attempts] ?? 600_000;
}

/** Input row from the bulk-async route: a successfully created invite record. */
export interface EnqueueInviteJobItemInput {
  record: CreatedMemberInviteRecord;
}

/**
 * Persists a new job and its items in two Mongo bulk writes.
 * Input: tenant id, actor identity, language, and per-item invite records.
 * Output: created job id and total item count.
 */
export async function enqueueInviteJob(input: {
  tenantId: string;
  actorIdentityId: string;
  language: 'he' | 'en';
  items: EnqueueInviteJobItemInput[];
  skippedCount: number;
}): Promise<{ jobId: string; totalCount: number }> {
  const db = await getMongoDb();
  const { memberInviteJobs, memberInviteJobItems } = getInviteJobCollections(db);
  const jobId = `member_invite_job_${randomUUID()}`;
  const now = new Date();
  const totalCount = input.items.length;

  const job: MemberInviteJob = {
    jobId,
    tenantId: input.tenantId,
    actorIdentityId: input.actorIdentityId,
    totalCount,
    sentCount: 0,
    failedCount: 0,
    skippedCount: input.skippedCount,
    status: totalCount === 0 ? 'completed' : 'queued',
    language: input.language,
    createdAt: now,
    updatedAt: now,
    ...(totalCount === 0 ? { completedAt: now } : {}),
  };
  await memberInviteJobs.insertOne(job);

  if (totalCount === 0) return { jobId, totalCount };

  const itemDocs: MemberInviteJobItem[] = input.items.map(({ record }) => ({
    jobItemId: `member_invite_job_item_${randomUUID()}`,
    jobId,
    tenantId: record.tenantId,
    invitationId: record.invitationId,
    email: record.email,
    language: record.language,
    tenantName: record.tenantName,
    displayName: record.displayName,
    roles: record.roles,
    services: record.services,
    rawToken: record.rawToken,
    expiresAt: record.expiresAt,
    status: 'queued',
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  }));
  await memberInviteJobItems.insertMany(itemDocs, { ordered: false });
  return { jobId, totalCount };
}

/**
 * Atomically claims one queued item that is due, flipping it to processing.
 * Input: none.
 * Output: the claimed item, or null when no due item is available.
 * The findOneAndUpdate filter on status+nextAttemptAt prevents two workers
 * from claiming the same row.
 */
export async function claimNextInviteJobItem(): Promise<MemberInviteJobItem | null> {
  const db = await getMongoDb();
  const { memberInviteJobItems } = getInviteJobCollections(db);
  const now = new Date();
  const claimed = await memberInviteJobItems.findOneAndUpdate(
    { status: 'queued', nextAttemptAt: { $lte: now } },
    { $set: { status: 'processing', claimedAt: now, updatedAt: now } },
    { sort: { nextAttemptAt: 1 }, returnDocument: 'after' },
  );
  return claimed ?? null;
}

/**
 * Marks an item as successfully sent and bumps the parent job sent counter.
 * Input: job item id and parent job id.
 * Output: none.
 */
export async function markInviteJobItemSent(jobItemId: string, jobId: string): Promise<void> {
  const db = await getMongoDb();
  const { memberInviteJobs, memberInviteJobItems } = getInviteJobCollections(db);
  const now = new Date();
  await memberInviteJobItems.updateOne(
    { jobItemId },
    { $set: { status: 'sent', sentAt: now, updatedAt: now }, $unset: { rawToken: '' } },
  );
  await memberInviteJobs.updateOne({ jobId }, { $inc: { sentCount: 1 }, $set: { updatedAt: now } });
  await refreshInviteJobStatus(jobId);
}

/**
 * Records a delivery failure, either scheduling a retry or marking the item
 * permanently failed after MAX_INVITE_ATTEMPTS.
 * Input: job item id, parent job id, current attempt count, error message.
 * Output: none.
 */
export async function markInviteJobItemFailure(input: {
  jobItemId: string;
  jobId: string;
  attempts: number;
  errorMessage: string;
}): Promise<void> {
  const db = await getMongoDb();
  const { memberInviteJobs, memberInviteJobItems } = getInviteJobCollections(db);
  const now = new Date();
  const nextAttempts = input.attempts + 1;

  if (nextAttempts >= MAX_INVITE_ATTEMPTS) {
    await memberInviteJobItems.updateOne(
      { jobItemId: input.jobItemId },
      {
        $set: {
          status: 'failed',
          attempts: nextAttempts,
          lastError: input.errorMessage,
          updatedAt: now,
        },
      },
    );
    await memberInviteJobs.updateOne(
      { jobId: input.jobId },
      { $inc: { failedCount: 1 }, $set: { updatedAt: now } },
    );
    await refreshInviteJobStatus(input.jobId);
    return;
  }

  const delay = nextAttemptDelayMs(nextAttempts);
  await memberInviteJobItems.updateOne(
    { jobItemId: input.jobItemId },
    {
      $set: {
        status: 'queued',
        attempts: nextAttempts,
        nextAttemptAt: new Date(now.getTime() + delay),
        lastError: input.errorMessage,
        updatedAt: now,
      },
    },
  );
}

/**
 * Reclaims items stuck in 'processing' for more than the cutoff (worker crash).
 * Input: stale cutoff in milliseconds (default 5 minutes).
 * Output: number of items reclaimed.
 */
export async function reclaimStaleInviteJobItems(staleAfterMs: number = 5 * 60_000): Promise<number> {
  const db = await getMongoDb();
  const { memberInviteJobItems } = getInviteJobCollections(db);
  const cutoff = new Date(Date.now() - staleAfterMs);
  const result = await memberInviteJobItems.updateMany(
    { status: 'processing', claimedAt: { $lte: cutoff } },
    { $set: { status: 'queued', nextAttemptAt: new Date(), updatedAt: new Date() } },
  );
  return result.modifiedCount ?? 0;
}

/**
 * Re-evaluates the parent job's aggregate status after a counter change.
 * Marks the job 'completed' once sent + failed equal totalCount.
 * Input: parent job id.
 * Output: none.
 */
async function refreshInviteJobStatus(jobId: string): Promise<void> {
  const db = await getMongoDb();
  const { memberInviteJobs } = getInviteJobCollections(db);
  const job = await memberInviteJobs.findOne({ jobId });
  if (!job) return;
  if (job.status === 'completed') return;
  const terminal = job.sentCount + job.failedCount;
  const updates: Partial<MemberInviteJob> = { updatedAt: new Date() };
  if (terminal >= job.totalCount) {
    updates.status = 'completed';
    updates.completedAt = new Date();
  } else if (job.status === 'queued') {
    updates.status = 'processing' as MemberInviteJobStatus;
  }
  await memberInviteJobs.updateOne({ jobId }, { $set: updates });
}

/**
 * Returns aggregate status and failed-item details for the dashboard poll.
 * Input: job id and tenant id (enforced so one tenant cannot read another).
 * Output: counters, status, language, and a list of failed items with the
 *         email and last error message.
 * Errors: 404 when the job does not belong to the tenant.
 */
export async function getInviteJobStatus(
  tenantId: string,
  jobId: string,
): Promise<{
  jobId: string;
  status: MemberInviteJobStatus;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  language: 'he' | 'en';
  failedItems: { email: string; lastError?: string }[];
}> {
  const db = await getMongoDb();
  const { memberInviteJobs, memberInviteJobItems } = getInviteJobCollections(db);
  const job = await memberInviteJobs.findOne({ jobId, tenantId });
  if (!job) throw createError('Invite job not found', 404);
  const failedItems = await memberInviteJobItems
    .find({ jobId, status: 'failed' }, { projection: { email: 1, lastError: 1 } })
    .limit(100)
    .toArray();
  return {
    jobId,
    status: job.status,
    totalCount: job.totalCount,
    sentCount: job.sentCount,
    failedCount: job.failedCount,
    skippedCount: job.skippedCount,
    language: job.language,
    failedItems: failedItems.map((item) => ({ email: item.email, lastError: item.lastError })),
  };
}

/**
 * Flips all failed items in a job back to queued so the worker re-tries them.
 * Input: tenant id and job id.
 * Output: number of items requeued.
 */
export async function retryFailedInviteJobItems(
  tenantId: string,
  jobId: string,
): Promise<{ requeued: number }> {
  const db = await getMongoDb();
  const { memberInviteJobs, memberInviteJobItems } = getInviteJobCollections(db);
  const job = await memberInviteJobs.findOne({ jobId, tenantId });
  if (!job) throw createError('Invite job not found', 404);
  const now = new Date();
  const result = await memberInviteJobItems.updateMany(
    { jobId, status: 'failed' },
    {
      $set: {
        status: 'queued',
        attempts: 0,
        nextAttemptAt: now,
        updatedAt: now,
      },
      $unset: { lastError: '' },
    },
  );
  const requeued = result.modifiedCount ?? 0;
  if (requeued > 0) {
    await memberInviteJobs.updateOne(
      { jobId },
      {
        $set: { status: 'queued', updatedAt: now },
        $inc: { failedCount: -requeued },
        $unset: { completedAt: '' },
      },
    );
  }
  return { requeued };
}
