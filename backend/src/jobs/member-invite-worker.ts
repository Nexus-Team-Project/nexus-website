/**
 * Background worker that delivers member invitation emails enqueued by the
 * bulk-async route. The worker polls Mongo for due items, sends through the
 * existing email service, and applies exponential backoff on failure. A
 * token bucket caps the global send rate so SendPulse limits are respected.
 */
import { getMongoDb } from '../config/mongo';
import { env } from '../config/env';
import { getTenantDomainCollections } from '../models/domain';
import {
  buildMemberInviteLoginUrl,
  sendTenantMemberInviteEmail,
} from '../services/domain-member-invite-email.service';
import {
  claimNextInviteJobItem,
  markInviteJobItemFailure,
  markInviteJobItemSent,
  reclaimStaleInviteJobItems,
} from '../services/member-invite-job.service';

const POLL_INTERVAL_MS = 2_000;
const STALE_SWEEP_INTERVAL_MS = 60_000;

/**
 * Simple token-bucket limiter shared across the in-process worker.
 * Refills at `ratePerSecond` tokens/second up to a 1-second burst.
 */
class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;

  constructor(private readonly ratePerSecond: number) {
    this.tokens = ratePerSecond;
    this.lastRefillMs = Date.now();
  }

  /** Awaits until a token is available, then consumes one. */
  async take(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.max(50, Math.ceil(1000 / this.ratePerSecond));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillMs) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(this.ratePerSecond, this.tokens + elapsedSec * this.ratePerSecond);
    this.lastRefillMs = now;
  }
}

/**
 * Processes one item end-to-end: rate-limited send, mark sent on success,
 * record failure with backoff on error.
 */
async function processOneItem(bucket: TokenBucket): Promise<boolean> {
  const item = await claimNextInviteJobItem();
  if (!item) return false;

  try {
    if (!item.rawToken) throw new Error('missing_raw_token');
    await bucket.take();

    const inviteUrl = buildMemberInviteLoginUrl(item.rawToken, item.language);
    const messageId = await sendTenantMemberInviteEmail({
      to: item.email,
      displayName: item.displayName,
      tenantName: item.tenantName,
      roles: item.roles as never,
      services: item.services,
      inviteUrl,
      expiresAt: item.expiresAt,
      language: item.language,
    });

    const db = await getMongoDb();
    const tenantCollections = getTenantDomainCollections(db);
    await tenantCollections.tenantMemberInvitations.updateOne(
      { tenantMemberInvitationId: item.invitationId },
      {
        $set: {
          ...(messageId ? { emailMessageId: messageId } : {}),
          lastEmailSentAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
    await markInviteJobItemSent(item.jobItemId, item.jobId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'send_failed';
    console.error('[MemberInviteWorker] send failed', {
      jobItemId: item.jobItemId,
      jobId: item.jobId,
      attempts: item.attempts,
      message: errorMessage,
    });
    await markInviteJobItemFailure({
      jobItemId: item.jobItemId,
      jobId: item.jobId,
      attempts: item.attempts,
      errorMessage,
    });
  }
  return true;
}

/**
 * Drains as many items as the concurrency window allows on a single tick.
 * Returns when the queue is empty for this tick.
 */
async function drainOnce(bucket: TokenBucket, concurrency: number): Promise<void> {
  let inFlight = 0;
  let done = false;

  await new Promise<void>((resolve) => {
    const launch = (): void => {
      if (done) return;
      if (inFlight >= concurrency) return;
      inFlight += 1;
      processOneItem(bucket)
        .then((claimed) => {
          inFlight -= 1;
          if (!claimed) {
            done = true;
            if (inFlight === 0) resolve();
            return;
          }
          launch();
          if (inFlight === 0 && done) resolve();
        })
        .catch(() => {
          inFlight -= 1;
          if (inFlight === 0) resolve();
        });
      // Try to fill remaining concurrency slots.
      if (!done && inFlight < concurrency) setImmediate(launch);
    };
    launch();
  });
}

let workerStarted = false;

/**
 * Starts the in-process invite worker. Safe to call once at boot.
 * Input: none.
 * Output: none. Spawns two intervals (drain + stale sweep) on the Node loop.
 */
export function startMemberInviteWorker(): void {
  if (workerStarted) return;
  workerStarted = true;

  const concurrency = Math.max(1, env.INVITE_WORKER_CONCURRENCY);
  const ratePerSec = Math.max(1, env.INVITE_SEND_RATE_PER_SEC);
  const bucket = new TokenBucket(ratePerSec);

  let draining = false;
  setInterval(() => {
    if (draining) return;
    draining = true;
    drainOnce(bucket, concurrency)
      .catch((err) => console.error('[MemberInviteWorker] drain error', err))
      .finally(() => {
        draining = false;
      });
  }, POLL_INTERVAL_MS);

  setInterval(() => {
    reclaimStaleInviteJobItems()
      .then((count) => {
        if (count > 0) console.log(`[MemberInviteWorker] reclaimed ${count} stale items`);
      })
      .catch((err) => console.error('[MemberInviteWorker] stale sweep error', err));
  }, STALE_SWEEP_INTERVAL_MS);

  console.log(
    `[MemberInviteWorker] started (concurrency=${concurrency}, rate=${ratePerSec}/s, poll=${POLL_INTERVAL_MS}ms)`,
  );
}
