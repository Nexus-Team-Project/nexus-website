/**
 * Mongo collection for tenant join requests. A wallet user without
 * membership in a tenant submits a request; a tenant admin approves
 * or denies it from the dashboard /users page.
 *
 * Auto-accept (status='auto_accepted') is recorded when the user
 * already had an open pending invite for that tenant at the moment
 * the request was POSTed - see spec section 10.4.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 4.5
 */
import { Db, ObjectId } from 'mongodb';

export const TENANT_JOIN_REQUEST_COLLECTION = 'tenantJoinRequests';

export type TenantJoinRequestStatus =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'auto_accepted';

/** A single join request row. */
export interface TenantJoinRequestDocument {
  _id?: ObjectId;
  /** Domain identity id (NOT prisma user id) of the requester. */
  nexusIdentityId: string;
  /** Tenant being requested. */
  tenantId: string;
  /** Snapshot of the requester's email + name at request time. */
  email: string;
  displayName?: string;
  status: TenantJoinRequestStatus;
  createdAt: Date;
  decidedAt?: Date;
  decidedByIdentityId?: string;
  denyReason?: string;
}

export async function ensureTenantJoinRequestIndexes(db: Db): Promise<void> {
  const col = db.collection<TenantJoinRequestDocument>(TENANT_JOIN_REQUEST_COLLECTION);
  // Mine: list one user's requests
  await col.createIndex({ nexusIdentityId: 1, status: 1 }, { name: 'identity_status' });
  // Admin: list a tenant's pending requests sorted newest-first
  await col.createIndex(
    { tenantId: 1, status: 1, createdAt: -1 },
    { name: 'tenant_status_createdAt' },
  );
  // Prevent duplicate pending requests for same (identity, tenant)
  await col.createIndex(
    { nexusIdentityId: 1, tenantId: 1, status: 1 },
    {
      name: 'no_duplicate_pending',
      unique: true,
      partialFilterExpression: { status: 'pending' },
    },
  );
}
