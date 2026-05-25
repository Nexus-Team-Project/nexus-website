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
import { getMongoDb } from '../config/mongo';
import { discoverTenants } from '../services/wallet/tenant-discovery.service';
import { getEcosystemCatalogForWallet } from '../services/wallet/ecosystem-catalog.service';
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
  sendJoinRequestAdminNotification,
  sendJoinRequestDecision,
} from '../services/email/join-request-email.service';
import { env } from '../config/env';
import { DOMAIN_COLLECTIONS } from '../models/domain/collections';
import { prisma } from '../config/database';

const router = Router();

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

// ── Tenant admin endpoints ──────────────────────────────────────────────────

export const tenantJoinAdminRouter = Router();

tenantJoinAdminRouter.get('/join-requests', authenticate, async (req: Request, res: Response) => {
  try {
    const ctx = await resolveTenantContextWithPermission(req, 'team.view_members');
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
    const ctx = await resolveTenantContextWithPermission(req, 'team.invite_member');
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
    .collection<{ tenantId: string; displayName: string }>(DOMAIN_COLLECTIONS.domainTenants)
    .find({ tenantId: { $in: args.tenantIds } })
    .project<{ tenantId: string; displayName: string }>({ tenantId: 1, displayName: 1 })
    .toArray();
  const nameByTenant = new Map(tenantNames.map((t) => [t.tenantId, t.displayName]));

  for (const row of adminRoleRows) {
    const email = emailByIdentity.get(row.nexusIdentityId);
    if (!email) continue;
    try {
      await sendJoinRequestAdminNotification({
        to: email,
        tenantName: nameByTenant.get(row.tenantId) ?? row.tenantId,
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
    .collection<{ tenantId: string; displayName: string }>(DOMAIN_COLLECTIONS.domainTenants)
    .findOne({ tenantId: args.tenantId }, { projection: { displayName: 1 } });
  void prisma; // future use - currently no Prisma lookup needed for email
  try {
    await sendJoinRequestDecision({
      to: email,
      tenantName: tenant?.displayName ?? args.tenantId,
      decision: args.decision,
      reason: args.reason,
      walletUrl,
    });
  } catch (e) {
    console.error('[join-request] decision email send failed:', email, e);
  }
}

export default router;
