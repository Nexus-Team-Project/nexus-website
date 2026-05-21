/**
 * Smoke check for the bulk-async invite queue (job + items + worker
 * lifecycle). Hits the real configured MongoDB and exercises every
 * state transition the background worker depends on:
 *   - enqueueInviteJob writes job + items with status=queued
 *   - claimNextInviteJobItem flips one to processing atomically
 *   - markInviteJobItemSent bumps sentCount and wipes rawToken
 *   - markInviteJobItemFailure schedules retry with exponential backoff
 *     and flips to failed after MAX_INVITE_ATTEMPTS
 *   - retryFailedInviteJobItems requeues failed items
 *   - reclaimStaleInviteJobItems re-queues stuck processing rows
 *   - getInviteJobStatus reflects all counter updates
 *
 * The script uses a synthetic tenantId (`smoke_invite_<uuid>`) so test
 * data is easy to spot and is fully deleted on exit. No emails are sent;
 * email delivery is tested by submitting one real invite from the UI.
 *
 * Run with:  npx tsx scripts/smoke-invite-job.ts
 * Exits 0 on pass, 1 on any failed assertion. Refuses to run when
 * NODE_ENV=production so this can never touch prod accidentally.
 */
import 'dotenv/config';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'crypto';
import { closeMongoConnection, getMongoDb, verifyMongoConnection } from '../src/config/mongo';
import {
  ensureInviteJobIndexes,
  getInviteJobCollections,
} from '../src/models/domain/invite-jobs.models';
import {
  claimNextInviteJobItem,
  enqueueInviteJob,
  getInviteJobStatus,
  markInviteJobItemFailure,
  markInviteJobItemSent,
  MAX_INVITE_ATTEMPTS,
  reclaimStaleInviteJobItems,
  retryFailedInviteJobItems,
} from '../src/services/member-invite-job.service';
import type { CreatedMemberInviteRecord } from '../src/services/member-invite-record.service';

if (process.env.NODE_ENV === 'production') {
  console.log('smoke is dev-only; skipping in production');
  process.exit(0);
}

const TENANT_ID = `smoke_invite_${randomUUID()}`;
const ACTOR_ID = `smoke_actor_${randomUUID()}`;

/** Builds a fake invite record - the worker only reads these fields. */
function fakeRecord(emailLocal: string): CreatedMemberInviteRecord {
  return {
    tenantId: TENANT_ID,
    tenantMemberId: `tm_${randomUUID()}`,
    nexusIdentityId: `ni_${randomUUID()}`,
    invitationId: `tenant_member_invitation_${randomUUID()}`,
    email: `${emailLocal}@smoke.invalid`,
    displayName: emailLocal,
    roles: ['member'],
    services: ['benefits_catalog'],
    groupIds: [],
    tenantName: 'Smoke Tenant',
    rawToken: `tok_${randomUUID()}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    language: 'en',
  };
}

async function cleanup(jobIds: string[]): Promise<void> {
  const db = await getMongoDb();
  const { memberInviteJobs, memberInviteJobItems } = getInviteJobCollections(db);
  await Promise.all([
    memberInviteJobs.deleteMany({ tenantId: TENANT_ID }),
    memberInviteJobItems.deleteMany({ tenantId: TENANT_ID }),
    memberInviteJobs.deleteMany({ jobId: { $in: jobIds } }),
    memberInviteJobItems.deleteMany({ jobId: { $in: jobIds } }),
  ]);
}

/**
 * Claim helper that retries until it returns an item belonging to OUR jobId.
 * The production worker (when `npm run dev` is running) competes for claims,
 * so we restore any non-matching item and try again. Bails after ~3s.
 */
async function claimMineWithRetry(jobId: string): Promise<{
  jobItemId: string;
  jobId: string;
  rawToken?: string;
  claimedAt?: Date;
  status: string;
} | null> {
  for (let i = 0; i < 30; i += 1) {
    const got = await claimNextInviteJobItem();
    if (!got) {
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }
    if (got.jobId === jobId) return got;
    // Stranger's item - put it back exactly how we found it so the real
    // worker (or other smoke runs) can keep going.
    const db = await getMongoDb();
    const { memberInviteJobItems } = getInviteJobCollections(db);
    await memberInviteJobItems.updateOne(
      { jobItemId: got.jobItemId },
      { $set: { status: 'queued' }, $unset: { claimedAt: '' } },
    );
  }
  return null;
}

async function main(): Promise<void> {
  const createdJobIds: string[] = [];
  let failed = 0;
  const step = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL ${name}`);
      console.error(err);
    }
  };

  await verifyMongoConnection();
  const db = await getMongoDb();
  await ensureInviteJobIndexes(db);
  const { memberInviteJobItems, memberInviteJobs } = getInviteJobCollections(db);

  console.log(`\nSmoke tenant: ${TENANT_ID}`);

  // ── enqueue ───────────────────────────────────────────────────────────
  let enqueueResult!: { jobId: string; totalCount: number };
  await step('enqueueInviteJob writes job + items', async () => {
    enqueueResult = await enqueueInviteJob({
      tenantId: TENANT_ID,
      actorIdentityId: ACTOR_ID,
      language: 'en',
      items: [{ record: fakeRecord('a') }, { record: fakeRecord('b') }, { record: fakeRecord('c') }],
      skippedCount: 1,
    });
    createdJobIds.push(enqueueResult.jobId);
    assert.equal(enqueueResult.totalCount, 3);
    const job = await memberInviteJobs.findOne({ jobId: enqueueResult.jobId });
    assert.ok(job, 'job inserted');
    assert.equal(job?.status, 'queued');
    assert.equal(job?.totalCount, 3);
    assert.equal(job?.skippedCount, 1);
    const itemCount = await memberInviteJobItems.countDocuments({ jobId: enqueueResult.jobId });
    assert.equal(itemCount, 3);
  });

  // ── claim ─────────────────────────────────────────────────────────────
  await step('claimNextInviteJobItem flips one item to processing', async () => {
    const claimed = await claimMineWithRetry(enqueueResult.jobId);
    assert.ok(claimed, 'returned a claimed item from our job');
    assert.equal(claimed?.status, 'processing');
    assert.ok(claimed?.claimedAt instanceof Date);
    assert.ok(claimed?.rawToken && claimed.rawToken.length > 0, 'rawToken carried for worker');
    await markInviteJobItemSent(claimed!.jobItemId, claimed!.jobId);
  });

  // ── mark sent updates counters + wipes rawToken ───────────────────────
  await step('markInviteJobItemSent updates counters and wipes rawToken', async () => {
    const job = await memberInviteJobs.findOne({ jobId: enqueueResult.jobId });
    assert.equal(job?.sentCount, 1, 'sent counter bumped');
    const sentItems = await memberInviteJobItems
      .find({ jobId: enqueueResult.jobId, status: 'sent' })
      .toArray();
    assert.equal(sentItems.length, 1);
    assert.equal(sentItems[0].rawToken, undefined, 'rawToken wiped on sent');
    assert.ok(sentItems[0].sentAt instanceof Date);
  });

  // ── failure path: backoff + final fail ────────────────────────────────
  await step('markInviteJobItemFailure schedules retry then flips to failed', async () => {
    const claimed = await claimMineWithRetry(enqueueResult.jobId);
    assert.ok(claimed);
    // First failure: should re-queue with nextAttemptAt in the future.
    await markInviteJobItemFailure({
      jobItemId: claimed!.jobItemId,
      jobId: claimed!.jobId,
      attempts: 0,
      errorMessage: 'smoke fake failure',
    });
    const requeued = await memberInviteJobItems.findOne({ jobItemId: claimed!.jobItemId });
    assert.equal(requeued?.status, 'queued', 'requeued after first failure');
    assert.equal(requeued?.attempts, 1);
    assert.ok(requeued?.nextAttemptAt instanceof Date);
    assert.ok((requeued!.nextAttemptAt.getTime() - Date.now()) > 5_000, 'backoff > 5s');

    // Burn through to MAX attempts in one shot by feeding the attempts arg.
    await markInviteJobItemFailure({
      jobItemId: claimed!.jobItemId,
      jobId: claimed!.jobId,
      attempts: MAX_INVITE_ATTEMPTS - 1,
      errorMessage: 'smoke terminal failure',
    });
    const dead = await memberInviteJobItems.findOne({ jobItemId: claimed!.jobItemId });
    assert.equal(dead?.status, 'failed', 'flipped to failed at MAX attempts');
    assert.equal(dead?.lastError, 'smoke terminal failure');
    const job = await memberInviteJobs.findOne({ jobId: enqueueResult.jobId });
    assert.equal(job?.failedCount, 1, 'failed counter bumped');
  });

  // ── getInviteJobStatus shape ──────────────────────────────────────────
  await step('getInviteJobStatus reflects all counters', async () => {
    const status = await getInviteJobStatus(TENANT_ID, enqueueResult.jobId);
    assert.equal(status.totalCount, 3);
    assert.equal(status.sentCount, 1);
    assert.equal(status.failedCount, 1);
    assert.equal(status.skippedCount, 1);
    assert.ok(status.failedItems.length >= 1, 'failed items surfaced');
  });

  // ── tenant scoping ────────────────────────────────────────────────────
  await step('getInviteJobStatus rejects wrong tenant', async () => {
    let threw = false;
    try {
      await getInviteJobStatus('other_tenant', enqueueResult.jobId);
    } catch (err) {
      threw = true;
      assert.match(String(err), /not found/i);
    }
    assert.ok(threw, 'cross-tenant read rejected');
  });

  // ── retry-failed flips failed rows back to queued ─────────────────────
  await step('retryFailedInviteJobItems re-queues failed items', async () => {
    const { requeued } = await retryFailedInviteJobItems(TENANT_ID, enqueueResult.jobId);
    assert.equal(requeued, 1, 'one failed item requeued');
    const job = await memberInviteJobs.findOne({ jobId: enqueueResult.jobId });
    assert.equal(job?.failedCount, 0, 'failedCount decremented');
    assert.equal(job?.status, 'queued', 'job moved back to queued');
  });

  // ── stale sweep ───────────────────────────────────────────────────────
  await step('reclaimStaleInviteJobItems re-queues stuck processing rows', async () => {
    // Hand-craft a stuck row directly so we do not race against the worker.
    const ourItem = await memberInviteJobItems.findOne({
      jobId: enqueueResult.jobId,
      status: 'queued',
    });
    assert.ok(ourItem, 'have a queued item to stale-test');
    await memberInviteJobItems.updateOne(
      { jobItemId: ourItem!.jobItemId },
      { $set: { status: 'processing', claimedAt: new Date(Date.now() - 10 * 60_000) } },
    );
    const count = await reclaimStaleInviteJobItems(5 * 60_000);
    assert.ok(count >= 1, 'reclaimed at least one stale row');
    const back = await memberInviteJobItems.findOne({ jobItemId: ourItem!.jobItemId });
    assert.equal(back?.status, 'queued', 'reclaimed row is queued again');
  });

  // ── job completion flips to completed ─────────────────────────────────
  // claimNext is global (oldest queued across the entire collection), so to
  // test completion deterministically we enqueue a solo job and call
  // markInviteJobItemSent directly on its only item. This still exercises
  // the same refreshInviteJobStatus path the worker hits in production.
  await step('job flips to completed when sent + failed == total', async () => {
    const solo = await enqueueInviteJob({
      tenantId: TENANT_ID,
      actorIdentityId: ACTOR_ID,
      language: 'en',
      items: [{ record: fakeRecord('completion') }],
      skippedCount: 0,
    });
    createdJobIds.push(solo.jobId);
    assert.equal(solo.totalCount, 1);
    const soloItem = await memberInviteJobItems.findOne({ jobId: solo.jobId });
    assert.ok(soloItem, 'solo item exists');
    await markInviteJobItemSent(soloItem!.jobItemId, soloItem!.jobId);
    const job = await memberInviteJobs.findOne({ jobId: solo.jobId });
    assert.equal(job?.status, 'completed', 'job completed');
    assert.equal(job?.sentCount, 1);
    assert.ok(job?.completedAt instanceof Date);
  });

  // ── zero-item job auto-completes at enqueue ───────────────────────────
  await step('zero-item job is enqueued as already-completed', async () => {
    const empty = await enqueueInviteJob({
      tenantId: TENANT_ID,
      actorIdentityId: ACTOR_ID,
      language: 'en',
      items: [],
      skippedCount: 3,
    });
    createdJobIds.push(empty.jobId);
    assert.equal(empty.totalCount, 0);
    const job = await memberInviteJobs.findOne({ jobId: empty.jobId });
    assert.equal(job?.status, 'completed');
    assert.equal(job?.skippedCount, 3);
  });

  // ── cleanup ───────────────────────────────────────────────────────────
  await cleanup(createdJobIds);

  console.log('\n' + (failed === 0 ? 'all smoke checks passed' : `${failed} smoke check(s) FAILED`));
  await closeMongoConnection();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('smoke crashed:', err);
  await closeMongoConnection();
  process.exit(1);
});
