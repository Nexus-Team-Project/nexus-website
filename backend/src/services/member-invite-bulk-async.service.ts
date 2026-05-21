/**
 * Orchestrates the asynchronous bulk-invite flow.
 * Deduplicates the chunk by lowercase email, runs an accurate seat-availability
 * check on the deduped set, creates invite records inside the request, and
 * hands email delivery off to a background worker via the job collection.
 */
import { createError } from '../middleware/errorHandler';
import { assertSeatAvailable } from './domain-tenant-plan.service';
import {
  requireMemberManagementAccess,
} from './domain-member.service';
import {
  createMemberInviteRecord,
  type CreatedMemberInviteRecord,
} from './member-invite-record.service';
import {
  enqueueInviteJob,
  type EnqueueInviteJobItemInput,
} from './member-invite-job.service';
import type { InviteTenantMemberInput } from '../schemas/domain-member.schemas';

/** Per-row outcome surfaced to the dashboard immediately after enqueue. */
export interface BulkInviteAsyncRowResult {
  email: string;
  ok: boolean;
  invitationId?: string;
  error?: string;
}

/** Response shape for POST /members/invitations/bulk-async. */
export interface BulkInviteAsyncResponse {
  jobId: string;
  totalQueued: number;
  totalSkipped: number;
  totalFailed: number;
  results: BulkInviteAsyncRowResult[];
}

/**
 * Enqueues a bulk invite job and returns immediately with a jobId the
 * dashboard can poll for progress.
 * Input: manager user id, validated invitation rows, language.
 * Output: jobId and per-row create-time results (queued / skipped / failed).
 * Errors: 403 when the deduped batch would exceed the plan seat limit.
 */
export async function enqueueBulkInviteAsync(
  managerUserId: string,
  invitations: InviteTenantMemberInput[],
  language: 'he' | 'en',
): Promise<BulkInviteAsyncResponse> {
  const access = await requireMemberManagementAccess(managerUserId);

  // Deduplicate by lowercase email - keep the first row for each email.
  const seen = new Set<string>();
  const deduped: InviteTenantMemberInput[] = [];
  const duplicateResults: BulkInviteAsyncRowResult[] = [];
  for (const row of invitations) {
    const key = row.email.trim().toLowerCase();
    if (seen.has(key)) {
      duplicateResults.push({ email: row.email, ok: false, error: 'duplicate_in_batch' });
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }

  // Seat check on deduped non-member rows - fixes the loose batch check the
  // legacy sync route had.
  const newNonMemberRows = deduped.filter((row) => row.roles.some((r) => r !== 'member')).length;
  if (newNonMemberRows > 0) {
    await assertSeatAvailable(access.tenantId, newNonMemberRows);
  }

  const itemInputs: EnqueueInviteJobItemInput[] = [];
  const perRowResults: BulkInviteAsyncRowResult[] = [];
  let skippedCount = 0;

  for (const row of deduped) {
    try {
      const record: CreatedMemberInviteRecord = await createMemberInviteRecord(access, row);
      itemInputs.push({ record });
      perRowResults.push({ email: row.email, ok: true, invitationId: record.invitationId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invite_failed';
      if (message === 'membership_exists') {
        skippedCount += 1;
        perRowResults.push({ email: row.email, ok: false, error: 'already_invited' });
      } else {
        perRowResults.push({ email: row.email, ok: false, error: message });
      }
    }
  }

  const { jobId, totalCount } = await enqueueInviteJob({
    tenantId: access.tenantId,
    actorIdentityId: access.managerIdentityId,
    language,
    items: itemInputs,
    skippedCount,
  });

  const allResults = [...perRowResults, ...duplicateResults];
  const totalFailed = allResults.filter((row) => !row.ok && row.error !== 'already_invited').length;

  return {
    jobId,
    totalQueued: totalCount,
    totalSkipped: skippedCount,
    totalFailed,
    results: allResults,
  };
}

/** Re-export to keep the import surface for routes small. */
export { getInviteJobStatus, retryFailedInviteJobItems } from './member-invite-job.service';

// Silence unused import lint when nothing else from this module re-exports.
void createError;
