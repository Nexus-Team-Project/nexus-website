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
import {
  createJoinRequests,
  listMyJoinRequests,
  listTenantPendingJoinRequests,
  approveJoinRequest,
  denyJoinRequest,
} from '../services/wallet/join-request.service';
import { getIdentityDomainCollections } from '../models/domain';
import { resolveTenantContextWithPermission } from '../utils/resolve-tenant-context';

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
      res.json({ status: 'approved', ...out, tenantId: ctx.tenantId });
      return;
    }
    const out = await denyJoinRequest(db, {
      requestId: req.params.id,
      adminIdentityId: me.nexusIdentityId,
      reason: parsed.data.reason,
    });
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

export default router;
