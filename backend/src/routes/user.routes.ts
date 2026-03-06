import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';

const router = Router();

// All /api/user routes require authentication
router.use(authenticate);

// ─── GET /api/user/profile ─────────────────────────────────

router.get('/profile', apiLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatarUrl: true,
        country: true,
        provider: true,
        createdAt: true,
        lastLoginAt: true,
        account: { select: { id: true, name: true, type: true, plan: true } },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/user/orders ──────────────────────────────────

router.get('/orders', apiLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page   = Math.max(1, Number(req.query.page) || 1);
    const limit  = Math.min(50, Number(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    // ALWAYS filter by authenticated userId — never omit this
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId: req.user!.sub },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.order.count({ where: { userId: req.user!.sub } }),
    ]);

    res.json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/user/stats ───────────────────────────────────

router.get('/stats', apiLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;

    const [orderStats, chatCount, recentActivity] = await Promise.all([
      // Order totals — scoped to userId
      prisma.$queryRaw<[{
        total_orders: bigint;
        succeeded_orders: bigint;
        total_spent: number;
      }]>`
        SELECT
          COUNT(*)::int                                          AS total_orders,
          COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::int     AS succeeded_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE status = 'SUCCEEDED'), 0) / 100.0 AS total_spent
        FROM "Order"
        WHERE "userId" = ${userId}`,
      prisma.chatSession.count({ where: { userId } }),
      // Recent EventLog entries for this user (PRODUCT + WALLET channels only)
      prisma.eventLog.findMany({
        where: { userId, channel: { in: ['PRODUCT', 'WALLET'] } },
        orderBy: { receivedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          eventName: true,
          channel: true,
          properties: true,
          receivedAt: true,
        },
      }),
    ]);

    const s = orderStats[0];
    res.json({
      totalOrders:    Number(s?.total_orders    ?? 0),
      succeededOrders: Number(s?.succeeded_orders ?? 0),
      totalSpent:     Number(s?.total_spent      ?? 0),
      chatSessions:   chatCount,
      recentActivity,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/user/workspace/setup ───────────────────────

router.post('/workspace/setup', apiLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    const { org_name, website, business_desc, primary_use_cases, phone, role } = req.body;

    if (!org_name || !business_desc) {
      res.status(400).json({ error: 'org_name and business_desc are required' });
      return;
    }

    // Upsert Account and link to user
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { accountId: true },
    });

    let accountId = existingUser?.accountId;

    if (accountId) {
      await prisma.account.update({
        where: { id: accountId },
        data: {
          name: org_name,
          websiteUrl: website || null,
          businessDesc: business_desc,
          useCases: primary_use_cases ?? [],
        },
      });
    } else {
      const account = await prisma.account.create({
        data: {
          name: org_name,
          websiteUrl: website || null,
          businessDesc: business_desc,
          useCases: primary_use_cases ?? [],
          type: 'B2B',
        },
      });
      accountId = account.id;
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        accountId,
        phone: phone || null,
        jobTitle: role || null,
        onboardingDone: true,
      },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
