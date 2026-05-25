/**
 * Tenant join-request lifecycle.
 *
 * createJoinRequests({ identityId, email, tenantIds }):
 *   For each tenant, if there's already a pending non-expired
 *   tenantMemberInvitation for this email -> auto-accept it (per spec
 *   section 10.4) and record status='auto_accepted'. Otherwise insert
 *   a pending row. Duplicate pending requests are blocked by the
 *   unique partial index on the collection.
 *
 * listMine: read own requests, surface tenant names.
 *
 * approveJoinRequest / denyJoinRequest: admin-only. On approve, create
 * the tenantUserRoles + tenantMembersV2 rows (role='member').
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 4.5, 6, 10.4
 */
import { Db, ObjectId } from 'mongodb';
import { randomUUID } from 'crypto';
import {
  TENANT_JOIN_REQUEST_COLLECTION,
  type TenantJoinRequestDocument,
} from '../../models/auth/tenant-join-request.models';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import { markTenantMemberInvitationAccepted } from '../domain-member-invitation-read.service';

export interface CreateJoinResult {
  created: string[];
  autoAccepted: string[];
  skipped: Array<{ tenantId: string; reason: string }>;
}

export async function createJoinRequests(
  db: Db,
  args: {
    nexusIdentityId: string;
    email: string;
    displayName?: string;
    tenantIds: string[];
  },
): Promise<CreateJoinResult> {
  const out: CreateJoinResult = { created: [], autoAccepted: [], skipped: [] };
  const now = new Date();

  for (const tenantId of args.tenantIds) {
    // 1) Auto-accept any pending non-expired invitation match.
    const invite = await db
      .collection(DOMAIN_COLLECTIONS.tenantMemberInvitations)
      .findOne({
        tenantId,
        normalizedEmail: args.email,
        status: 'pending',
        expiresAt: { $gt: now },
      });
    if (invite) {
      try {
        await markTenantMemberInvitationAccepted(invite as never, args.nexusIdentityId);
        out.autoAccepted.push(tenantId);
        await db.collection<TenantJoinRequestDocument>(TENANT_JOIN_REQUEST_COLLECTION).insertOne({
          nexusIdentityId: args.nexusIdentityId,
          tenantId,
          email: args.email,
          displayName: args.displayName,
          status: 'auto_accepted',
          createdAt: now,
          decidedAt: now,
        });
        continue;
      } catch (e) {
        // Fall through to create a pending request.
        console.error('[join-request] auto-accept failed for', tenantId, e);
      }
    }

    // 2) Otherwise insert pending. Unique index blocks duplicate pendings.
    try {
      await db.collection<TenantJoinRequestDocument>(TENANT_JOIN_REQUEST_COLLECTION).insertOne({
        nexusIdentityId: args.nexusIdentityId,
        tenantId,
        email: args.email,
        displayName: args.displayName,
        status: 'pending',
        createdAt: now,
      });
      out.created.push(tenantId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      if (msg.includes('duplicate')) {
        out.skipped.push({ tenantId, reason: 'already_pending' });
      } else {
        out.skipped.push({ tenantId, reason: 'insert_failed' });
      }
    }
  }
  return out;
}

export interface MyJoinRequestView {
  id: string;
  tenantId: string;
  tenantName?: string;
  status: TenantJoinRequestDocument['status'];
  createdAt: string;
  decidedAt?: string;
  denyReason?: string;
}

export async function listMyJoinRequests(
  db: Db,
  args: { nexusIdentityId: string },
): Promise<MyJoinRequestView[]> {
  const rows = await db
    .collection<TenantJoinRequestDocument>(TENANT_JOIN_REQUEST_COLLECTION)
    .find({ nexusIdentityId: args.nexusIdentityId })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  if (rows.length === 0) return [];
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId)));
  // domainTenants stores the human-readable name under organizationName.
  const tenants = await db
    .collection<{ tenantId: string; organizationName?: string }>(DOMAIN_COLLECTIONS.domainTenants)
    .find({ tenantId: { $in: tenantIds } })
    .project<{ tenantId: string; organizationName?: string }>({
      tenantId: 1,
      organizationName: 1,
    })
    .toArray();
  const nameById = new Map(
    tenants.map((t) => [t.tenantId, t.organizationName?.trim() || 'Tenant']),
  );
  return rows.map((r) => ({
    id: (r._id as ObjectId).toHexString(),
    tenantId: r.tenantId,
    tenantName: nameById.get(r.tenantId),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString(),
    denyReason: r.denyReason,
  }));
}

/** Admin view of a tenant's pending requests. */
export async function listTenantPendingJoinRequests(
  db: Db,
  args: { tenantId: string },
): Promise<TenantJoinRequestDocument[]> {
  return db
    .collection<TenantJoinRequestDocument>(TENANT_JOIN_REQUEST_COLLECTION)
    .find({ tenantId: args.tenantId, status: 'pending' })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
}

/**
 * Approve a pending request. Creates the tenantUserRoles + tenantMembersV2
 * rows (role='member' per spec section 9). Idempotent.
 */
export async function approveJoinRequest(
  db: Db,
  args: { requestId: string; adminIdentityId: string },
): Promise<{ tenantId: string; nexusIdentityId: string }> {
  if (!ObjectId.isValid(args.requestId)) throw new Error('request_invalid');
  const col = db.collection<TenantJoinRequestDocument>(TENANT_JOIN_REQUEST_COLLECTION);
  const doc = await col.findOne({ _id: new ObjectId(args.requestId) });
  if (!doc) throw new Error('request_invalid');
  if (doc.status !== 'pending') throw new Error(`request_${doc.status}`);

  const now = new Date();
  // Idempotent upserts.
  await db.collection(DOMAIN_COLLECTIONS.tenantUserRoles).updateOne(
    { nexusIdentityId: doc.nexusIdentityId, tenantId: doc.tenantId, role: 'member' },
    {
      $setOnInsert: {
        tenantUserRoleId: `tur_${randomUUID()}`,
        nexusIdentityId: doc.nexusIdentityId,
        tenantId: doc.tenantId,
        role: 'member',
        grantedByIdentityId: args.adminIdentityId,
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true },
  );
  await db.collection(DOMAIN_COLLECTIONS.tenantMembers).updateOne(
    { nexusIdentityId: doc.nexusIdentityId, tenantId: doc.tenantId },
    {
      $setOnInsert: { createdAt: now },
      $set: { status: 'active', updatedAt: now, email: doc.email },
    },
    { upsert: true },
  );
  await col.updateOne(
    { _id: doc._id },
    { $set: { status: 'approved', decidedAt: now, decidedByIdentityId: args.adminIdentityId } },
  );
  return { tenantId: doc.tenantId, nexusIdentityId: doc.nexusIdentityId };
}

/** Deny a pending request. */
export async function denyJoinRequest(
  db: Db,
  args: { requestId: string; adminIdentityId: string; reason?: string },
): Promise<{ tenantId: string; nexusIdentityId: string; email: string }> {
  if (!ObjectId.isValid(args.requestId)) throw new Error('request_invalid');
  const col = db.collection<TenantJoinRequestDocument>(TENANT_JOIN_REQUEST_COLLECTION);
  const doc = await col.findOne({ _id: new ObjectId(args.requestId) });
  if (!doc) throw new Error('request_invalid');
  if (doc.status !== 'pending') throw new Error(`request_${doc.status}`);
  const now = new Date();
  await col.updateOne(
    { _id: doc._id },
    {
      $set: {
        status: 'denied',
        decidedAt: now,
        decidedByIdentityId: args.adminIdentityId,
        ...(args.reason ? { denyReason: args.reason } : {}),
      },
    },
  );
  return { tenantId: doc.tenantId, nexusIdentityId: doc.nexusIdentityId, email: doc.email };
}
