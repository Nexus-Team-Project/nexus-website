/**
 * Reads and enforces billing-plan seat limits for tenant non-member roles.
 * Regular `member` roles are unlimited. All other roles (admin, finance,
 * operator, analyst, developer, supply_manager) consume one seat per distinct
 * identity. An identity holding multiple non-member roles still counts as one seat.
 *
 * Plan limits: basic=3, advanced=5, premium=10 (see PLAN_SEAT_LIMITS).
 * Plans are stored on the domain Tenant document. Existing tenants without
 * a `plan` field default to 'basic' via the ?? fallback.
 *
 * All future billing/upgrade flows MUST use PayMe — never Stripe or PayPlus.
 */
import { getMongoDb } from '../config/mongo';
import { createError } from '../middleware/errorHandler';
import { DOMAIN_COLLECTIONS } from '../models/domain/collections';
import { getIdentityDomainCollections, getTenantDomainCollections } from '../models/domain';
import { PLAN_SEAT_LIMITS, type TenantPlan } from '../models/domain/tenant.models';

/** The `member` role is free and unlimited — only other roles consume seats. */
function isSeatConsumingRole(role: string): boolean {
  return role !== 'member';
}

export interface TenantPlanSummary {
  plan: TenantPlan;
  seatsUsed: number;
  seatLimit: number;
  remainingSeats: number;
  isAtLimit: boolean;
}

/**
 * Counts distinct identities occupying a non-member seat for the tenant.
 * Rules:
 * - Seats used by identities with accepted invitations always count.
 * - Seats used by identities with pending, non-expired invitations count
 *   (invite sent but not yet accepted still reserves a seat).
 * - Seats are freed when the latest invitation expires or is revoked and the
 *   person never accepted (i.e. TenantUserRole exists but invite is dead).
 * - Directly added members with no invitation record always count.
 * - The tenant creator is excluded via excludeIdentityId.
 * Input: tenant id, optional creator identity id to exclude from the count.
 * Output: number of occupied non-member seats (each identity counted once).
 */
async function countNonMemberSeatsUsed(tenantId: string, excludeIdentityId?: string): Promise<number> {
  const db = await getMongoDb();
  const identityCollections = getIdentityDomainCollections(db);

  const matchStage: Record<string, unknown> = { tenantId, role: { $ne: 'member' } };
  if (excludeIdentityId) {
    matchStage.nexusIdentityId = { $ne: excludeIdentityId };
  }

  const now = new Date();

  const result = await identityCollections.tenantUserRoles
    .aggregate<{ count: number }>([
      { $match: matchStage },
      // Deduplicate by identity (one non-member seat per person regardless of how many roles).
      { $group: { _id: '$nexusIdentityId' } },
      // Join with the most recent invitation for this identity in this tenant.
      {
        $lookup: {
          from: DOMAIN_COLLECTIONS.tenantMemberInvitations,
          let: { identityId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$tenantId', tenantId] },
                    { $eq: ['$nexusIdentityId', '$$identityId'] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: 'latestInvitation',
        },
      },
      // Keep the identity if:
      // - No invitation exists (directly added member, always counts).
      // - Invitation is accepted (real member, always counts).
      // - Invitation is pending AND not yet expired (seat reserved until expiry).
      // Exclude if invitation is revoked, or pending but past expiresAt.
      {
        $match: {
          $or: [
            // No invitation record - direct add
            { latestInvitation: { $size: 0 } },
            // Accepted - confirmed member
            { 'latestInvitation.0.status': 'accepted' },
            // Pending and still within expiry window
            {
              'latestInvitation.0.status': 'pending',
              'latestInvitation.0.expiresAt': { $gte: now },
            },
          ],
        },
      },
      { $count: 'count' },
    ])
    .toArray();

  return result[0]?.count ?? 0;
}

/**
 * Returns the current plan and seat usage for a tenant.
 * The tenant creator (createdByIdentityId) is excluded from the seat count
 * so they don't consume one of the billable non-member slots.
 * Input: tenant id string.
 * Output: plan tier, seats used, seat limit, remaining seats, and at-limit flag.
 */
export async function getTenantPlanSummary(tenantId: string): Promise<TenantPlanSummary> {
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);

  // Fetch tenant first to get plan + creator id before counting seats.
  const tenant = await tenantCollections.domainTenants.findOne(
    { tenantId },
    { projection: { plan: 1, createdByIdentityId: 1 } },
  );

  const seatsUsed = await countNonMemberSeatsUsed(tenantId, tenant?.createdByIdentityId);

  const plan: TenantPlan = (tenant?.plan ?? 'basic') as TenantPlan;
  const seatLimit = PLAN_SEAT_LIMITS[plan];
  const remainingSeats = Math.max(0, seatLimit - seatsUsed);

  return {
    plan,
    seatsUsed,
    seatLimit,
    remainingSeats,
    isAtLimit: seatsUsed >= seatLimit,
  };
}

/**
 * Asserts that a tenant has enough non-member seat capacity for new additions.
 * Call this before inserting new non-member roles for NEW identities.
 * An identity that already holds any non-member role for this tenant does NOT
 * consume an additional seat (they already occupy one).
 * Input: tenant id, number of NEW seats required (default 1).
 * Output: throws 403 with code 'seat_limit_reached' when capacity is exceeded.
 */
export async function assertSeatAvailable(tenantId: string, newSeatsRequired = 1): Promise<void> {
  if (newSeatsRequired <= 0) return;

  const summary = await getTenantPlanSummary(tenantId);
  if (summary.remainingSeats < newSeatsRequired) {
    throw Object.assign(
      createError(
        `Plan seat limit reached (${summary.seatsUsed}/${summary.seatLimit}). Upgrade your plan to invite more non-member roles.`,
        403,
      ),
      { code: 'seat_limit_reached' },
    );
  }
}

/**
 * Checks whether an identity already holds any non-member role for a tenant.
 * Used to determine if an invite/role-change would require a new seat.
 * Input: tenant id and identity id.
 * Output: true when the identity already occupies a non-member seat for the tenant.
 */
export async function identityAlreadyHoldsNonMemberSeat(
  tenantId: string,
  nexusIdentityId: string,
): Promise<boolean> {
  const db = await getMongoDb();
  const identityCollections = getIdentityDomainCollections(db);
  const existing = await identityCollections.tenantUserRoles.findOne({
    tenantId,
    nexusIdentityId,
    role: { $ne: 'member' },
  });
  return existing !== null;
}
