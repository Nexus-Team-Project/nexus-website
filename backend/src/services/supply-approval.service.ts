/**
 * Supply Approval Service - voucher offer lifecycle: list, approve, and deny.
 *
 * Extracted from supply.service.ts to keep that file within the 350-line limit.
 * This file owns the read (listing with platform-admin visibility) and the two
 * admin write operations (approve / deny) for the voucher approval flow.
 *
 * Related: supply.service.ts (create/update/delete), voucher-approval-email.service.ts (emails).
 */

import { getMongoDb } from '../config/mongo';
import {
  getSupplyDomainCollections,
  type NexusOffer,
} from '../models/domain/supply.models';

/**
 * Lists all active platform offers that are visible to a specific tenant.
 * Platform admins additionally see pending_approval offers so they can review them.
 *
 * Visibility rules:
 * - `ecosystem` offers are visible to all tenants.
 * - `tenant_only` offers are visible only to the tenant whose id matches invitedByTenantId.
 *
 * Input:
 *   tenantId - MongoDB tenantId of the requesting tenant.
 *   category - Optional category slug to narrow results; pass `'all'` or omit to return all.
 *   options.isPlatformAdmin - When true, includes pending_approval offers in results.
 * Output: Promise resolving to NexusOffer[] sorted newest-first.
 *         Returns an empty array when no offers match.
 */
export async function listPlatformOffers(
  tenantId: string,
  category?: string,
  options?: { isPlatformAdmin?: boolean },
): Promise<NexusOffer[]> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  // Platform admins can see pending_approval offers to perform approve/deny actions.
  const statusFilter: unknown = options?.isPlatformAdmin
    ? { $in: ['active', 'pending_approval'] }
    : 'active';

  const filter: Record<string, unknown> = {
    status: statusFilter,
    $or: [
      { visibility: 'ecosystem' },
      { visibility: 'tenant_only', invitedByTenantId: tenantId },
    ],
  };

  // Apply category filter only when a specific category is requested.
  if (category && category !== 'all') {
    filter['category'] = category;
  }

  return nexusOffers.find(filter).sort({ createdAt: -1 }).toArray();
}

/**
 * Approves a voucher offer that is currently in pending_approval status.
 * Sets the offer status to 'active' so it becomes visible to all adopting tenants.
 *
 * Input:  offerId - UUID of the offer to approve.
 * Output: Promise resolving to the updated NexusOffer, or null when not found
 *         or not in pending_approval status.
 */
export async function approveOffer(offerId: string): Promise<NexusOffer | null> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  const result = await nexusOffers.findOneAndUpdate(
    { offerId, status: 'pending_approval' },
    { $set: { status: 'active', updatedAt: new Date() } },
    { returnDocument: 'after' },
  );

  return result ?? null;
}

/**
 * Denies a voucher offer that is currently in pending_approval status.
 * Sets the offer status to 'denied' and records the reason so the supplier can address it.
 * The supplier can edit and resubmit the offer via updateOffer in supply.service.ts.
 *
 * Input:
 *   offerId - UUID of the offer to deny.
 *   reason  - Human-readable explanation for the denial (min 10, max 1000 chars).
 * Output: Promise resolving to the updated NexusOffer, or null when not found
 *         or not in pending_approval status.
 */
export async function denyOffer(offerId: string, reason: string): Promise<NexusOffer | null> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  const result = await nexusOffers.findOneAndUpdate(
    { offerId, status: 'pending_approval' },
    { $set: { status: 'denied', denial_reason: reason, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );

  return result ?? null;
}
