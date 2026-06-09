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
import { activeCatalogTenantIds } from './tenant-discovery.service';
import { applyMirrorTokensToTenantContact } from './wallet-mirror-fields.helper';
import { profileToMirrorTokens, profileFullName, normalizeGenderToken, type WalletProfileLike } from '../../config/wallet-profile-fields';

export interface CreateJoinResult {
  created: string[];
  autoAccepted: string[];
  skipped: Array<{ tenantId: string; reason: string }>;
}

/** Sentinel grantedBy value when a membership is created by auto-accept. */
const SYSTEM_AUTO_ACCEPT = 'system_auto_accept';

/**
 * Idempotently create the membership records for a user joining a tenant:
 * tenantUserRoles (role 'member'), tenantMembers (status active), and
 * tenantContacts (status active). Shared by manual approval and auto-accept so
 * both produce identical state. Mirrors the invite-accept flow.
 *
 * @param args.grantedByIdentityId the approving admin, or SYSTEM_AUTO_ACCEPT.
 */
export async function materializeTenantMembership(
  db: Db,
  args: {
    tenantId: string;
    nexusIdentityId: string;
    email: string;
    displayName?: string;
    grantedByIdentityId: string;
  },
): Promise<void> {
  const now = new Date();
  // Carry the identity's phone onto the tenant rows so the dashboard /users page
  // shows it. NexusIdentity.phone is the source of truth (set when the user adds
  // a phone in the wallet); absent for users who never added one.
  const identityDoc = await db
    .collection<{ nexusIdentityId: string; phone?: string; phoneVerifiedAt?: Date; profile?: WalletProfileLike }>(DOMAIN_COLLECTIONS.nexusIdentities)
    .findOne({ nexusIdentityId: args.nexusIdentityId }, { projection: { phone: 1, phoneVerifiedAt: 1, profile: 1 } });
  const phone = identityDoc?.phone;
  // The phone is "verified" on the row only if the user confirmed it via OTP.
  const phoneFields = phone ? { phone, phoneVerified: !!identityDoc?.phoneVerifiedAt } : {};

  // Prefer the wallet profile name for the contact's display name; always overwrite an
  // existing row's name with it when present. Fall back to the caller-supplied name, then
  // the email local-part, only when the profile has no name (and only on insert).
  const fullName = profileFullName(identityDoc?.profile ?? {});

  await db.collection(DOMAIN_COLLECTIONS.tenantUserRoles).updateOne(
    { nexusIdentityId: args.nexusIdentityId, tenantId: args.tenantId, role: 'member' },
    {
      $setOnInsert: {
        tenantUserRoleId: `tur_${randomUUID()}`,
        nexusIdentityId: args.nexusIdentityId,
        tenantId: args.tenantId,
        role: 'member',
        grantedByIdentityId: args.grantedByIdentityId,
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true },
  );
  await db.collection(DOMAIN_COLLECTIONS.tenantMembers).updateOne(
    { nexusIdentityId: args.nexusIdentityId, tenantId: args.tenantId },
    {
      $setOnInsert: {
        tenantMemberId: `tenant_member_${randomUUID()}`,
        nexusIdentityId: args.nexusIdentityId,
        tenantId: args.tenantId,
        services: [],
        createdAt: now,
      },
      $set: { status: 'active', updatedAt: now, email: args.email, ...phoneFields },
    },
    { upsert: true },
  );
  // Mirror the invite-accept flow: an approved member must also appear in the
  // tenant's Contacts tab.
  //
  // displayName placement rules (Mongo rejects a field in both $set and $setOnInsert):
  //   - fullName present  -> always overwrite with wallet name via $set
  //   - fullName absent   -> fall back to caller-supplied name / email prefix, new rows only via $setOnInsert
  const contactSetOnInsert: Record<string, unknown> = {
    tenantContactId: `tenant_contact_${randomUUID()}`,
    tenantId: args.tenantId,
    email: args.email,
    normalizedEmail: args.email,
    createdAt: now,
  };
  // nexusIdentityId is in $set (not $setOnInsert) so a pre-existing
  // admin-added contact (added by email, no identity link) gets backfilled
  // when its owner joins - otherwise the mirror write below, which matches by
  // nexusIdentityId, would silently miss that row.
  const contactSet: Record<string, unknown> = {
    status: 'active', lastActivityAt: now, updatedAt: now,
    nexusIdentityId: args.nexusIdentityId, ...phoneFields,
  };
  if (fullName) {
    contactSet.displayName = fullName;
  } else {
    contactSetOnInsert.displayName = args.displayName ?? args.email.split('@')[0];
  }
  await db.collection(DOMAIN_COLLECTIONS.tenantContacts).updateOne(
    { tenantId: args.tenantId, normalizedEmail: args.email },
    { $setOnInsert: contactSetOnInsert, $set: contactSet },
    { upsert: true },
  );

  // Mirror the member's onboarding answers into this tenant's contact columns.
  // Reuse identityDoc.profile fetched above - no second round-trip needed.
  if (identityDoc?.profile) {
    await applyMirrorTokensToTenantContact(
      db, args.tenantId, args.nexusIdentityId, profileToMirrorTokens(identityDoc.profile),
    );
  }
}

/**
 * Read a tenant's auto-accept-join-requests setting. Absent (tenants created
 * before the field existed) is treated as ON, matching the schema default.
 */
async function tenantAutoAcceptsJoinRequests(db: Db, tenantId: string): Promise<boolean> {
  const tenant = await db
    .collection<{ tenantId: string; autoAcceptJoinRequests?: boolean }>(DOMAIN_COLLECTIONS.domainTenants)
    .findOne({ tenantId }, { projection: { autoAcceptJoinRequests: 1 } });
  return tenant?.autoAcceptJoinRequests ?? true;
}

/** Read the requester's mirrorable answers for a pending-request snapshot. */
async function readAnswersSnapshot(
  db: Db, nexusIdentityId: string,
): Promise<TenantJoinRequestDocument['answersSnapshot'] | undefined> {
  const doc = await db
    .collection<{ profile?: WalletProfileLike }>(DOMAIN_COLLECTIONS.nexusIdentities)
    .findOne({ nexusIdentityId }, { projection: { profile: 1 } });
  const p = doc?.profile;
  if (!p) return undefined;
  const snap: NonNullable<TenantJoinRequestDocument['answersSnapshot']> = {};
  if (Array.isArray(p.purpose) && p.purpose.length) snap.purpose = p.purpose;
  if (p.lifeStage) snap.lifeStage = p.lifeStage;
  if (p.gender) snap.gender = normalizeGenderToken(p.gender);
  if (p.birthday) snap.birthday = (p.birthday instanceof Date ? p.birthday : new Date(p.birthday)).toISOString().slice(0, 10);
  if (typeof p.motivation === 'string' && p.motivation.trim()) snap.motivation = p.motivation.trim();
  return Object.keys(snap).length ? snap : undefined;
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
  const answersSnapshot = await readAnswersSnapshot(db, args.nexusIdentityId);

  // Tenants without an active Benefits Catalog cannot be joined from the wallet
  // (they are shown as "soon"). One query for the whole batch; the per-tenant
  // guard below rejects any that are not active, unless the user already holds a
  // direct invitation from that tenant (which is honored regardless).
  const activeCatalog = await activeCatalogTenantIds(db, args.tenantIds);

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

    // 2) Block join requests to tenants that have not activated their Benefits
    //    Catalog. They are listed in the wallet as "soon" but not joinable; this
    //    is the server-side enforcement of that rule (frontend only disables the
    //    row). A direct invitation above is the one exception and already
    //    short-circuited via `continue`.
    if (!activeCatalog.has(tenantId)) {
      out.skipped.push({ tenantId, reason: 'catalog_inactive' });
      continue;
    }

    // 3) Auto-accept by tenant setting (default ON): make them a member now,
    //    exactly as a manual approval would, and record an auto_accepted row.
    if (await tenantAutoAcceptsJoinRequests(db, tenantId)) {
      try {
        await materializeTenantMembership(db, {
          tenantId,
          nexusIdentityId: args.nexusIdentityId,
          email: args.email,
          displayName: args.displayName,
          grantedByIdentityId: SYSTEM_AUTO_ACCEPT,
        });
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
        // Fall through to a pending request if auto-accept hit an error.
        console.error('[join-request] auto-accept-by-setting failed for', tenantId, e);
      }
    }

    // 4) Otherwise insert pending. Unique index blocks duplicate pendings.
    try {
      await db.collection<TenantJoinRequestDocument>(TENANT_JOIN_REQUEST_COLLECTION).insertOne({
        nexusIdentityId: args.nexusIdentityId,
        tenantId,
        email: args.email,
        displayName: args.displayName,
        status: 'pending',
        createdAt: now,
        ...(answersSnapshot ? { answersSnapshot } : {}),
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
  // Create the membership records (idempotent) - shared with auto-accept.
  await materializeTenantMembership(db, {
    tenantId: doc.tenantId,
    nexusIdentityId: doc.nexusIdentityId,
    email: doc.email,
    displayName: doc.displayName,
    grantedByIdentityId: args.adminIdentityId,
  });

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
