/**
 * Wallet tenant-discovery + join-request routes.
 *
 * GET /api/v1/wallet/tenants/discover         - search discoverable tenants
 * POST /api/v1/wallet/join-requests           - submit one or more requests
 * GET /api/v1/wallet/join-requests/mine       - list own requests
 * GET /api/v1/tenant/join-requests            - tenant admin: pending list
 * PATCH /api/v1/tenant/join-requests/:id      - tenant admin: approve / deny
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 6
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { discoverTenants } from '../services/wallet/tenant-discovery.service';
import { getEcosystemCatalogForWallet } from '../services/wallet/ecosystem-catalog.service';
import { setWalletDefaultTenant } from '../services/wallet/wallet-default-tenant.service';
import {
  createJoinRequests,
  listMyJoinRequests,
  listTenantPendingJoinRequests,
  approveJoinRequest,
  denyJoinRequest,
} from '../services/wallet/join-request.service';
import { getIdentityDomainCollections } from '../models/domain';
import { resolveTenantContextWithPermission } from '../utils/resolve-tenant-context';
import {
  getDomainAuthorizationContext,
  hasDomainPermission,
} from '../services/domain-authorization.service';
import {
  sendJoinRequestAdminNotification,
  sendJoinRequestDecision,
} from '../services/email/join-request-email.service';
import { env } from '../config/env';
import { DOMAIN_COLLECTIONS } from '../models/domain/collections';
import { prisma } from '../config/database';

const router = Router();

// Rate-limit all wallet tenant-discovery / join-request routes (100 req/min/IP).
router.use(apiLimiter);

async function getCallingNexusIdentity(req: Request): Promise<{ nexusIdentityId: string; email: string; displayName?: string } | null> {
  const email = req.user!.email.toLowerCase().trim();
  const db = await getMongoDb();
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const doc = await nexusIdentities.findOne(
    { normalizedEmail: email },
    { projection: { nexusIdentityId: 1, displayName: 1 } },
  );
  if (!doc) return null;
  return { nexusIdentityId: doc.nexusIdentityId, email, displayName: doc.displayName };
}

/**
 * Resolves the caller's real tenant id for join-request admin actions.
 *
 * `resolveTenantContextWithPermission` has a platform-admin fast-path:
 * if the caller's email is listed in NEXUS_ADMIN_EMAILS, it returns
 * the `nexus_platform` sentinel tenant id and skips the actual
 * `tenantMembersV2` lookup. That is correct for catalog/supply
 * routes (platform admins write platform-origin offers), but it is
 * WRONG for tenant-scoped admin endpoints like this one: a platform
 * admin who also owns a real tenant must still see the join requests
 * for that real tenant, not for the `nexus_platform` sentinel which
 * has none. Without this helper the wallet's admin saw an empty
 * panel even when MongoDB clearly had a pending request for them.
 *
 * The helper looks up the caller's active `tenantMembersV2` row
 * directly. If found, it returns that real tenant context. If the
 * caller has no active membership, it falls back to
 * `resolveTenantContextWithPermission` so non-platform-admin
 * callers still get the standard 403 path.
 *
 * Inputs:
 *   req         - Express request, authenticated.
 *   permission  - Domain permission required for this admin action.
 * Output: { tenantId, identityId } for the caller's real tenant.
 * Throws: Forbidden (403) when the caller has no tenant admin context.
 */
async function resolveAdminTenantForJoinRequests(
  req: Request,
  permission: 'team.view_members' | 'team.invite_member',
): Promise<{ tenantId: string; identityId: string }> {
  const email = req.user!.email.toLowerCase().trim();
  const db = await getMongoDb();
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const identity = await nexusIdentities.findOne(
    { normalizedEmail: email },
    { projection: { nexusIdentityId: 1 } },
  );
  if (identity) {
    const tenantMember = await db
      .collection<{ tenantId: string; nexusIdentityId: string; status: string; createdAt: Date }>(
        DOMAIN_COLLECTIONS.tenantMembers,
      )
      .findOne(
        { nexusIdentityId: identity.nexusIdentityId, status: 'active' },
        { sort: { createdAt: 1 }, projection: { tenantId: 1 } },
      );
    if (tenantMember) {
      // Real-tenant path: enforce the requested permission on this
      // specific tenant + identity pair before returning.
      const auth = await getDomainAuthorizationContext(
        identity.nexusIdentityId,
        tenantMember.tenantId,
      );
      if (!hasDomainPermission(auth, permission)) {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      }
      return {
        tenantId: tenantMember.tenantId,
        identityId: identity.nexusIdentityId,
      };
    }
  }
  // No real tenant membership - defer to the standard helper. For a
  // pure platform admin with no tenant this throws 403, which is the
  // right behavior: there are no join requests to administer.
  const ctx = await resolveTenantContextWithPermission(req, permission);
  return { tenantId: ctx.tenantId, identityId: ctx.identityId };
}

// ── Wallet user endpoints ───────────────────────────────────────────────────

router.get('/ecosystem-offers', authenticate, async (req: Request, res: Response) => {
  try {
    const me = await getCallingNexusIdentity(req);
    if (!me) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const db = await getMongoDb();
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
    const result = await getEcosystemCatalogForWallet(db, {
      nexusIdentityId: me.nexusIdentityId,
      query: q,
      limit: Number.isFinite(limit) ? (limit as number) : undefined,
    });
    res.json(result);
  } catch (e) {
    console.error('[wallet-tenants] ecosystem-offers failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/tenants/discover', authenticate, async (req: Request, res: Response) => {
  try {
    const me = await getCallingNexusIdentity(req);
    if (!me) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const db = await getMongoDb();
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const tenants = await discoverTenants(db, { nexusIdentityId: me.nexusIdentityId, query: q });
    res.json({ tenants });
  } catch (e) {
    console.error('[wallet-tenants] discover failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

const joinRequestsSchema = z.object({
  tenantIds: z.array(z.string().min(1).max(200)).min(1).max(20),
});

router.post('/join-requests', authenticate, async (req: Request, res: Response) => {
  const parsed = joinRequestsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const me = await getCallingNexusIdentity(req);
    if (!me) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const db = await getMongoDb();
    const out = await createJoinRequests(db, {
      nexusIdentityId: me.nexusIdentityId,
      email: me.email,
      displayName: me.displayName,
      tenantIds: parsed.data.tenantIds,
    });
    // Best-effort: notify admins of every freshly-pending request.
    if (out.created.length > 0) {
      void notifyAdminsOfPendingRequests({
        db,
        tenantIds: out.created,
        requesterEmail: me.email,
        requesterDisplayName: me.displayName,
      }).catch((err) =>
        console.error('[join-request] admin notify failed (non-fatal):', err),
      );
    }
    // Auto-accepted requests: email the joiner their "you've joined" approval.
    // No admin email - the tenant opted into auto-accept, nothing to action.
    for (const tenantId of out.autoAccepted) {
      void notifyRequesterOfDecision({
        db,
        tenantId,
        nexusIdentityId: me.nexusIdentityId,
        decision: 'approved',
        requesterEmail: me.email,
      }).catch((err) =>
        console.error('[join-request] auto-accept email failed (non-fatal):', err),
      );
    }
    res.json(out);
  } catch (e) {
    console.error('[wallet-tenants] create-join failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/join-requests/mine', authenticate, async (req: Request, res: Response) => {
  try {
    const me = await getCallingNexusIdentity(req);
    if (!me) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const db = await getMongoDb();
    const rows = await listMyJoinRequests(db, { nexusIdentityId: me.nexusIdentityId });
    res.json({ requests: rows });
  } catch (e) {
    console.error('[wallet-tenants] list-mine failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Set the caller's default landing context. null => Nexus (ecosystem)
// catalog; a string => a tenantId the caller belongs to (re-checked
// server-side in the service). Caller identity is derived from the
// authenticated session, never from the request body.
const defaultTenantSchema = z.object({
  tenantId: z.string().min(1).max(200).nullable(),
});

router.patch('/default-tenant', authenticate, async (req: Request, res: Response) => {
  const parsed = defaultTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const me = await getCallingNexusIdentity(req);
    if (!me) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const db = await getMongoDb();
    await setWalletDefaultTenant(db, {
      nexusIdentityId: me.nexusIdentityId,
      tenantId: parsed.data.tenantId,
    });
    res.json({ ok: true, defaultTenantId: parsed.data.tenantId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'not_a_member') {
      res.status(403).json({ error: 'not_a_member' });
      return;
    }
    console.error('[wallet-tenants] set default-tenant failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ── Tenant admin endpoints ──────────────────────────────────────────────────

export const tenantJoinAdminRouter = Router();

// Rate-limit the tenant-admin join-request routes (100 req/min/IP).
tenantJoinAdminRouter.use(apiLimiter);

// Auto-accept setting. Registered BEFORE '/join-requests/:id' so 'settings'
// is never matched as a request id.
tenantJoinAdminRouter.get('/join-requests/settings', authenticate, async (req: Request, res: Response) => {
  try {
    const ctx = await resolveAdminTenantForJoinRequests(req, 'team.view_members');
    const db = await getMongoDb();
    const tenant = await db
      .collection<{ tenantId: string; autoAcceptJoinRequests?: boolean }>(DOMAIN_COLLECTIONS.domainTenants)
      .findOne({ tenantId: ctx.tenantId }, { projection: { autoAcceptJoinRequests: 1 } });
    res.json({ autoAcceptEnabled: tenant?.autoAcceptJoinRequests ?? true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg.includes('forbidden') || msg.includes('permission')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    console.error('[wallet-tenants] get join settings failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

const autoAcceptSchema = z.object({ autoAcceptEnabled: z.boolean() });

tenantJoinAdminRouter.patch('/join-requests/settings', authenticate, async (req: Request, res: Response) => {
  const parsed = autoAcceptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }
  try {
    const ctx = await resolveAdminTenantForJoinRequests(req, 'team.invite_member');
    const db = await getMongoDb();
    await db.collection(DOMAIN_COLLECTIONS.domainTenants).updateOne(
      { tenantId: ctx.tenantId },
      { $set: { autoAcceptJoinRequests: parsed.data.autoAcceptEnabled, updatedAt: new Date() } },
    );
    res.json({ autoAcceptEnabled: parsed.data.autoAcceptEnabled });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg.includes('forbidden') || msg.includes('permission')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    console.error('[wallet-tenants] set join settings failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

tenantJoinAdminRouter.get('/join-requests', authenticate, async (req: Request, res: Response) => {
  try {
    const ctx = await resolveAdminTenantForJoinRequests(req, 'team.view_members');
    const db = await getMongoDb();
    const rows = await listTenantPendingJoinRequests(db, { tenantId: ctx.tenantId });
    res.json({
      requests: rows.map((r) => ({
        id: r._id?.toHexString(),
        nexusIdentityId: r.nexusIdentityId,
        email: r.email,
        displayName: r.displayName ?? null,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        answersSnapshot: r.answersSnapshot ?? null,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg.includes('forbidden') || msg.includes('permission')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    console.error('[wallet-tenants] tenant list-pending failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

const decisionSchema = z.object({
  decision: z.enum(['approve', 'deny']),
  reason: z.string().trim().max(500).optional(),
});

tenantJoinAdminRouter.patch('/join-requests/:id', authenticate, async (req: Request, res: Response) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_decision' });
    return;
  }
  try {
    const ctx = await resolveAdminTenantForJoinRequests(req, 'team.invite_member');
    const me = await getCallingNexusIdentity(req);
    if (!me) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const db = await getMongoDb();
    if (parsed.data.decision === 'approve') {
      const out = await approveJoinRequest(db, {
        requestId: req.params.id,
        adminIdentityId: me.nexusIdentityId,
      });
      void notifyRequesterOfDecision({
        db,
        tenantId: out.tenantId,
        nexusIdentityId: out.nexusIdentityId,
        decision: 'approved',
      }).catch((err) => console.error('[join-request] decision email failed:', err));
      res.json({ status: 'approved', ...out, tenantId: ctx.tenantId });
      return;
    }
    const out = await denyJoinRequest(db, {
      requestId: req.params.id,
      adminIdentityId: me.nexusIdentityId,
      reason: parsed.data.reason,
    });
    void notifyRequesterOfDecision({
      db,
      tenantId: out.tenantId,
      nexusIdentityId: out.nexusIdentityId,
      decision: 'denied',
      reason: parsed.data.reason,
      requesterEmail: out.email,
    }).catch((err) => console.error('[join-request] decision email failed:', err));
    res.json({ status: 'denied', ...out, tenantId: ctx.tenantId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'request_invalid') return res.status(400).json({ error: 'request_invalid' });
    if (msg.startsWith('request_')) return res.status(409).json({ error: msg });
    if (msg.includes('forbidden') || msg.includes('permission')) {
      return res.status(403).json({ error: 'forbidden' });
    }
    console.error('[wallet-tenants] decide failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * Find every admin/owner identity for the given tenants and send each
 * one a "new join request" email. Best-effort: any single send failure
 * is logged and skipped so a downed mail server can never block a
 * working /join-requests POST.
 */
async function notifyAdminsOfPendingRequests(args: {
  db: import('mongodb').Db;
  tenantIds: string[];
  requesterEmail: string;
  requesterDisplayName?: string;
}): Promise<void> {
  const dashboardUrl = env.DASHBOARD_URL ?? 'http://localhost:5174';
  const adminRoles = ['admin', 'owner'] as const;
  // For each tenant, gather admin emails via Prisma user join.
  const adminRoleRows = await args.db
    .collection<{ tenantId: string; nexusIdentityId: string; role: string }>(
      DOMAIN_COLLECTIONS.tenantUserRoles,
    )
    .find({ tenantId: { $in: args.tenantIds }, role: { $in: [...adminRoles] } })
    .toArray();
  if (adminRoleRows.length === 0) return;

  const identityIds = Array.from(new Set(adminRoleRows.map((r) => r.nexusIdentityId)));
  const identities = await args.db
    .collection<{ nexusIdentityId: string; normalizedEmail: string; prismaUserId?: string }>(
      DOMAIN_COLLECTIONS.nexusIdentities,
    )
    .find({ nexusIdentityId: { $in: identityIds } })
    .project<{ nexusIdentityId: string; normalizedEmail: string }>({
      nexusIdentityId: 1,
      normalizedEmail: 1,
    })
    .toArray();
  const emailByIdentity = new Map(identities.map((i) => [i.nexusIdentityId, i.normalizedEmail]));

  const tenantNames = await args.db
    .collection<{ tenantId: string; organizationName?: string }>(DOMAIN_COLLECTIONS.domainTenants)
    .find({ tenantId: { $in: args.tenantIds } })
    .project<{ tenantId: string; organizationName?: string }>({
      tenantId: 1,
      organizationName: 1,
    })
    .toArray();
  const nameByTenant = new Map(
    tenantNames.map((t) => [t.tenantId, t.organizationName?.trim() || 'Tenant']),
  );

  // Dedupe: one admin can hold multiple privileged roles on the same
  // tenant (e.g. both 'admin' and 'owner' rows after a sync). Without
  // this, they receive one email per role row - the user reported
  // seeing duplicate "new join request" emails in their inbox.
  const seen = new Set<string>();
  for (const row of adminRoleRows) {
    const email = emailByIdentity.get(row.nexusIdentityId);
    if (!email) continue;
    const key = `${row.tenantId}|${email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await sendJoinRequestAdminNotification({
        to: email,
        // Never expose the raw Mongo tenantId hex in an email.
        tenantName: nameByTenant.get(row.tenantId) ?? 'Tenant',
        requesterEmail: args.requesterEmail,
        requesterDisplayName: args.requesterDisplayName,
        dashboardUrl,
      });
    } catch (e) {
      console.error('[join-request] admin notify send failed:', email, e);
    }
  }
}

/**
 * Send the requester their decision email. Looks up their email via
 * the identity unless one is supplied (denial path passes it through
 * so we don't lose the row to a TTL race).
 */
async function notifyRequesterOfDecision(args: {
  db: import('mongodb').Db;
  tenantId: string;
  nexusIdentityId: string;
  decision: 'approved' | 'denied';
  reason?: string;
  requesterEmail?: string;
}): Promise<void> {
  const walletUrl =
    (env as unknown as { WALLET_URL?: string }).WALLET_URL ?? 'http://localhost:8080';
  let email = args.requesterEmail;
  if (!email) {
    const identity = await args.db
      .collection<{ nexusIdentityId: string; normalizedEmail: string }>(
        DOMAIN_COLLECTIONS.nexusIdentities,
      )
      .findOne(
        { nexusIdentityId: args.nexusIdentityId },
        { projection: { normalizedEmail: 1 } },
      );
    email = identity?.normalizedEmail;
  }
  if (!email) return;
  const tenant = await args.db
    .collection<{ tenantId: string; organizationName?: string }>(DOMAIN_COLLECTIONS.domainTenants)
    .findOne(
      { tenantId: args.tenantId },
      { projection: { organizationName: 1 } },
    );
  void prisma; // future use - currently no Prisma lookup needed for email
  try {
    await sendJoinRequestDecision({
      to: email,
      // Never expose the raw Mongo tenantId hex in an email.
      tenantName: tenant?.organizationName?.trim() || 'Tenant',
      decision: args.decision,
      reason: args.reason,
      walletUrl,
    });
  } catch (e) {
    console.error('[join-request] decision email send failed:', email, e);
  }
}

export default router;
