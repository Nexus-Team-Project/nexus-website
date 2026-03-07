import { Router, Request, Response, NextFunction } from 'express';
import { OrgRole } from '@prisma/client';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';
import * as orgService from '../services/org.service';

const router = Router();

// ─── requireOrgRole middleware factory ───────────────────────────
//
// Allows access if:
//   (a) the requesting user has global ADMIN role, OR
//   (b) the user has a membership in the org (identified by :slug)
//       with role ≥ minRole.
//
// Role hierarchy: OWNER (3) > ADMIN (2) > MEMBER (1)
//
function requireOrgRole(minRole: OrgRole) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;

      // Global ADMIN bypasses org-role check
      if (req.user!.role === 'ADMIN') {
        next();
        return;
      }

      const slug = req.params.slug;
      if (!slug) {
        res.status(400).json({ error: 'Missing org slug' });
        return;
      }

      const org = await prisma.organization.findUnique({ where: { slug } });
      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }

      const membership = await prisma.organizationMember.findUnique({
        where: { userId_orgId: { userId, orgId: org.id } },
      });

      if (!membership) {
        res.status(403).json({ error: 'You are not a member of this organization' });
        return;
      }

      if (orgService.roleRank(membership.role) < orgService.roleRank(minRole)) {
        res.status(403).json({ error: `Requires ${minRole} role or higher` });
        return;
      }

      // Attach membership to request for downstream use
      (req as Request & { membership: typeof membership }).membership = membership;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ─── Helper to send service errors with proper HTTP status ────────
function sendServiceError(err: unknown, res: Response, next: NextFunction) {
  const e = err as Error & { status?: number };
  if (e.status) {
    res.status(e.status).json({ error: e.message });
    return;
  }
  next(err);
}

// ─── POST /api/orgs — Create org [global ADMIN only] ─────────────
router.post(
  '/',
  authenticate,
  requireAdmin,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, nameHe, logoUrl, primaryColor, plan, websiteUrl, isPremium, isPublished, slug } = req.body;
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const org = await orgService.createOrg({
        name,
        nameHe,
        logoUrl,
        primaryColor,
        plan,
        websiteUrl,
        isPremium,
        isPublished,
        slug,
        creatorId: req.user!.sub,
      });
      res.status(201).json(org);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/orgs — List all orgs [global ADMIN only] ───────────
router.get(
  '/',
  authenticate,
  requireAdmin,
  apiLimiter,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const orgs = await orgService.listOrgs();
      res.json(orgs);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/orgs/:slug — Get org by slug [public] ──────────────
router.get(
  '/:slug',
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = await orgService.getOrgBySlug(req.params.slug);
      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }
      res.json(org);
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /api/orgs/:slug — Update org [org OWNER/ADMIN or global ADMIN] ──
router.patch(
  '/:slug',
  authenticate,
  requireOrgRole('ADMIN'),
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, nameHe, logoUrl, primaryColor, plan, websiteUrl, isPremium, isPublished } = req.body;
      const org = await orgService.updateOrg(req.params.slug, {
        name,
        nameHe,
        logoUrl,
        primaryColor,
        plan,
        websiteUrl,
        isPremium,
        isPublished,
      });
      res.json(org);
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

// ─── DELETE /api/orgs/:slug — Delete org [global ADMIN only] ─────
router.delete(
  '/:slug',
  authenticate,
  requireAdmin,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await orgService.deleteOrg(req.params.slug);
      res.status(204).send();
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

// ─── GET /api/orgs/:slug/members — List members [org member] ─────
router.get(
  '/:slug/members',
  authenticate,
  requireOrgRole('MEMBER'),
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const members = await orgService.listMembers(req.params.slug);
      res.json(members);
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

// ─── POST /api/orgs/:slug/members — Add member [org OWNER/ADMIN] ─
router.post(
  '/:slug/members',
  authenticate,
  requireOrgRole('ADMIN'),
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, role } = req.body;
      if (!email) {
        res.status(400).json({ error: 'email is required' });
        return;
      }

      // Validate role value
      const validRoles: OrgRole[] = ['OWNER', 'ADMIN', 'MEMBER'];
      const memberRole: OrgRole = validRoles.includes(role) ? role : 'MEMBER';

      // Only OWNER can assign OWNER role; ADMIN can assign up to ADMIN
      const requesterMembership = (req as Request & { membership?: { role: OrgRole } }).membership;
      const requesterRole: OrgRole = req.user!.role === 'ADMIN' ? 'OWNER' : (requesterMembership?.role ?? 'MEMBER');

      if (orgService.roleRank(memberRole) > orgService.roleRank(requesterRole)) {
        res.status(403).json({ error: 'Cannot assign a role higher than your own' });
        return;
      }

      const member = await orgService.addMember(req.params.slug, email, memberRole);
      res.status(201).json(member);
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

// ─── PATCH /api/orgs/:slug/members/:userId — Update member [org OWNER/ADMIN] ──
router.patch(
  '/:slug/members/:userId',
  authenticate,
  requireOrgRole('ADMIN'),
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, displayName, avatarUrl, title } = req.body;
      const targetUserId = req.params.userId;

      // Validate role
      if (role) {
        const validRoles: OrgRole[] = ['OWNER', 'ADMIN', 'MEMBER'];
        if (!validRoles.includes(role)) {
          res.status(400).json({ error: 'Invalid role' });
          return;
        }

        // Requester must have a higher rank than the role being assigned
        const requesterMembership = (req as Request & { membership?: { role: OrgRole } }).membership;
        const requesterRole: OrgRole = req.user!.role === 'ADMIN' ? 'OWNER' : (requesterMembership?.role ?? 'MEMBER');

        // Fetch target's current role
        const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
        if (org) {
          const targetMembership = await prisma.organizationMember.findUnique({
            where: { userId_orgId: { userId: targetUserId, orgId: org.id } },
          });
          if (targetMembership && orgService.roleRank(targetMembership.role) >= orgService.roleRank(requesterRole)) {
            res.status(403).json({ error: 'Cannot modify a member with equal or higher role' });
            return;
          }
          if (orgService.roleRank(role) > orgService.roleRank(requesterRole)) {
            res.status(403).json({ error: 'Cannot assign a role higher than your own' });
            return;
          }
        }
      }

      const member = await orgService.updateMember(req.params.slug, targetUserId, { role, displayName, avatarUrl, title });
      res.json(member);
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

// ─── DELETE /api/orgs/:slug/members/:userId — Remove member [org OWNER/ADMIN] ──
router.delete(
  '/:slug/members/:userId',
  authenticate,
  requireOrgRole('ADMIN'),
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = req.params.userId;
      const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });

      if (org) {
        const targetMembership = await prisma.organizationMember.findUnique({
          where: { userId_orgId: { userId: targetUserId, orgId: org.id } },
        });

        // Requester must outrank the target
        const requesterMembership = (req as Request & { membership?: { role: OrgRole } }).membership;
        const requesterRole: OrgRole = req.user!.role === 'ADMIN' ? 'OWNER' : (requesterMembership?.role ?? 'MEMBER');

        if (targetMembership && orgService.roleRank(targetMembership.role) >= orgService.roleRank(requesterRole)) {
          res.status(403).json({ error: 'Cannot remove a member with equal or higher role' });
          return;
        }
      }

      await orgService.removeMember(req.params.slug, targetUserId);
      res.status(204).send();
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

export default router;
