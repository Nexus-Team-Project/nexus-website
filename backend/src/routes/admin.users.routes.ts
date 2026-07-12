import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';

const router = Router();

// All routes: authenticate + ADMIN only
router.use(authenticate, requireAdmin, apiLimiter);

// ─── Helpers ──────────────────────────────────────────────────────

/** Derive UI status from DB fields */
function deriveStatus(user: { emailVerified: boolean; lastLoginAt: Date | null }): 'pending' | 'active' | 'inactive' {
  if (!user.emailVerified) return 'pending';
  if (!user.lastLoginAt) return 'inactive';
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return user.lastLoginAt >= thirtyDaysAgo ? 'active' : 'inactive';
}

/** Prisma select for user list/detail items */
const userSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  emailVerified: true,
  avatarUrl: true,
  phone: true,
  jobTitle: true,
  country: true,
  provider: true,
  createdAt: true,
  lastLoginAt: true,
  orgMemberships: {
    select: {
      role: true,
      org: {
        select: { id: true, slug: true, name: true, logoUrl: true, primaryColor: true },
      },
    },
  },
} as const;

// ─── GET /api/admin/users ─────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search  = (req.query.search  as string | undefined)?.trim() ?? '';
    const role    = req.query.role    as string | undefined;
    const status  = req.query.status  as string | undefined;
    const page    = Math.max(1, Number(req.query.page)  || 1);
    const limit   = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset  = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { email:    { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role && ['USER', 'ADMIN', 'AGENT'].includes(role)) {
      where.role = role;
    }

    if (status === 'pending') {
      where.emailVerified = false;
    } else if (status === 'active') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      where.emailVerified = true;
      where.lastLoginAt   = { gte: thirtyDaysAgo };
    } else if (status === 'inactive') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      where.emailVerified = true;
      where.OR = [
        { lastLoginAt: null },
        { lastLoginAt: { lt: thirtyDaysAgo } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users: users.map((u) => ({ ...u, status: deriveStatus(u) })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/users/:id ─────────────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: userSelect,
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ ...user, status: deriveStatus(user) });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/admin/users/:id ───────────────────────────────────
// Updates GLOBAL UserRole only — OrgRole is managed via /api/orgs/:slug/members/:userId

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fullName, phone, jobTitle, role, emailVerified } = req.body;

    const data: Record<string, unknown> = {};
    if (fullName      !== undefined) data.fullName      = String(fullName);
    if (phone         !== undefined) data.phone         = phone ? String(phone) : null;
    if (jobTitle      !== undefined) data.jobTitle      = jobTitle ? String(jobTitle) : null;
    if (emailVerified !== undefined) data.emailVerified = Boolean(emailVerified);
    if (role          !== undefined) {
      if (!['USER', 'ADMIN', 'AGENT'].includes(role)) {
        res.status(400).json({ error: 'Invalid role. Must be USER, ADMIN, or AGENT' });
        return;
      }
      data.role = role;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const user = await prisma.user.update({
      where:  { id: req.params.id },
      data,
      select: userSelect,
    });

    res.json({ ...user, status: deriveStatus(user) });
  } catch (err) {
    if ((err as { code?: unknown })?.code === 'P2025') { res.status(404).json({ error: 'User not found' }); return; }
    next(err);
  }
});

// ─── DELETE /api/admin/users/:id ─────────────────────────────────

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Prevent self-delete
    if (req.params.id === req.user!.sub) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if ((err as { code?: unknown })?.code === 'P2025') { res.status(404).json({ error: 'User not found' }); return; }
    next(err);
  }
});

export default router;
