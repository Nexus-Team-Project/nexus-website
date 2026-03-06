import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAgent } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';
import * as NotificationService from '../services/notification.service';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate, requireAgent);

// ─── GET /api/dashboard/metrics ───────────────────────────

router.get('/metrics', apiLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const period = (req.query.period as string) ?? 'week';
    const days = period === 'day' ? 1 : period === 'month' ? 30 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const prevSince = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000);

    // Use COUNT(DISTINCT) via raw SQL instead of groupBy().length
    // groupBy returns all rows then counts in memory — wasteful on large tables
    const [
      [{ count: currentVisitors }],
      [{ count: prevVisitors }],
      currentChats, prevChats,
      currentLeads, prevLeads,
    ] = await Promise.all([
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT "visitorId")::int AS count FROM "PageView"
        WHERE "createdAt" >= ${since}`,
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT "visitorId")::int AS count FROM "PageView"
        WHERE "createdAt" >= ${prevSince} AND "createdAt" < ${since}`,
      prisma.chatSession.count({ where: { createdAt: { gte: since } } }),
      prisma.chatSession.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
      prisma.lead.count({ where: { createdAt: { gte: since } } }),
      prisma.lead.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
    ]);

    const cv = Number(currentVisitors);
    const pv = Number(prevVisitors);

    const pct = (curr: number, prev: number) =>
      prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);

    const conversionRate = cv > 0
      ? Math.round((currentLeads / cv) * 1000) / 10
      : 0;

    res.json({
      period,
      visitors:   { value: cv,           change: pct(cv, pv) },
      chats:      { value: currentChats,  change: pct(currentChats, prevChats) },
      leads:      { value: currentLeads,  change: pct(currentLeads, prevLeads) },
      conversion: { value: conversionRate, unit: '%' },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/dashboard/chart ──────────────────────────────

router.get('/chart', apiLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(Number(req.query.days) || 7, 90); // cap at 90 days

    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    // Fetch ALL data in 4 queries total (not N×days queries in a loop)
    const [pageViewRows, chatRows, leadRows, signupRows] = await Promise.all([
      // Unique visitors per day via COUNT(DISTINCT) grouped by date
      prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
        SELECT DATE("createdAt") AS day, COUNT(DISTINCT "visitorId")::int AS count
        FROM "PageView"
        WHERE "createdAt" >= ${since}
        GROUP BY DATE("createdAt")
        ORDER BY day ASC`,
      prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
        SELECT DATE("createdAt") AS day, COUNT(*)::int AS count
        FROM "ChatSession"
        WHERE "createdAt" >= ${since}
        GROUP BY DATE("createdAt")
        ORDER BY day ASC`,
      prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
        SELECT DATE("createdAt") AS day, COUNT(*)::int AS count
        FROM "Lead"
        WHERE "createdAt" >= ${since}
        GROUP BY DATE("createdAt")
        ORDER BY day ASC`,
      // Signups from EventLog (source of truth)
      prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
        SELECT DATE("receivedAt") AS day, COUNT(DISTINCT "userId")::int AS count
        FROM "EventLog"
        WHERE "eventName" = 'User_Signed_Up' AND "receivedAt" >= ${since}
        GROUP BY DATE("receivedAt")
        ORDER BY day ASC`,
    ]);

    // Build lookup maps for O(1) access
    const pvMap     = new Map(pageViewRows.map(r => [String(r.day).slice(0, 10), Number(r.count)]));
    const chatMap   = new Map(chatRows.map(r => [String(r.day).slice(0, 10), Number(r.count)]));
    const leadMap   = new Map(leadRows.map(r => [String(r.day).slice(0, 10), Number(r.count)]));
    const signupMap = new Map(signupRows.map(r => [String(r.day).slice(0, 10), Number(r.count)]));

    // Build response array filling in zeros for days with no data
    const points = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      points.push({
        date:     key,
        visitors: pvMap.get(key)     ?? 0,
        chats:    chatMap.get(key)   ?? 0,
        leads:    leadMap.get(key)   ?? 0,
        signups:  signupMap.get(key) ?? 0,
      });
    }

    res.json(points);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/dashboard/visitors ──────────────────────────

router.get('/visitors', apiLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    // Single query: join VisitorProfile with last PageView per visitor
    // Replaces N+1 pattern (1 + N queries → 1 query)
    const enriched = await prisma.$queryRaw<
      Array<{
        visitorId: string;
        ip: string | null;
        city: string | null;
        country: string | null;
        device: string | null;
        browser: string | null;
        firstSeen: Date;
        lastSeen: Date;
        pageViews: number;
        lastPage: string | null;
        lastPageAt: Date | null;
      }>
    >`
      SELECT
        vp."visitorId",
        vp."ip",
        vp."city",
        vp."country",
        vp."device",
        vp."browser",
        vp."firstSeen",
        vp."lastSeen",
        vp."pageViews",
        lp.page    AS "lastPage",
        lp."createdAt" AS "lastPageAt"
      FROM "VisitorProfile" vp
      LEFT JOIN LATERAL (
        SELECT page, "createdAt"
        FROM "PageView"
        WHERE "visitorId" = vp."visitorId"
        ORDER BY "createdAt" DESC
        LIMIT 1
      ) lp ON TRUE
      ORDER BY vp."lastSeen" DESC
      LIMIT ${limit}
    `;

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/dashboard/notifications ─────────────────────

router.get(
  '/notifications',
  apiLimiter,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const notifications = await NotificationService.getUnreadNotifications(30);
      res.json(notifications);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/dashboard/notifications/read ───────────────

router.post(
  '/notifications/read',
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ids } = req.body as { ids: string[] };
      await NotificationService.markNotificationsRead(ids);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/dashboard/revenue ───────────────────────────

router.get('/revenue', apiLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);

    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const [rows, totals] = await Promise.all([
      prisma.$queryRaw<Array<{ day: string; revenue: number; transactions: bigint }>>`
        SELECT
          DATE("receivedAt") AS day,
          COALESCE(SUM((properties->>'amount_cents')::int), 0) / 100.0 AS revenue,
          COUNT(*)::int AS transactions
        FROM "EventLog"
        WHERE "eventName" = 'Payment_Completed'
          AND "receivedAt" >= ${since}
        GROUP BY DATE("receivedAt")
        ORDER BY day ASC`,
      prisma.$queryRaw<[{ total_revenue: number; total_transactions: bigint }]>`
        SELECT
          COALESCE(SUM((properties->>'amount_cents')::int), 0) / 100.0 AS total_revenue,
          COUNT(*)::int AS total_transactions
        FROM "EventLog"
        WHERE "eventName" = 'Payment_Completed'
          AND "receivedAt" >= ${since}`,
    ]);

    const points: Array<{ date: string; revenue: number; transactions: number }> = [];
    const rowMap = new Map(rows.map(r => [String(r.day).slice(0, 10), r]));
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const row = rowMap.get(key);
      points.push({ date: key, revenue: row ? Number(row.revenue) : 0, transactions: row ? Number(row.transactions) : 0 });
    }

    res.json({
      days,
      total_revenue: Number(totals[0]?.total_revenue ?? 0),
      total_transactions: Number(totals[0]?.total_transactions ?? 0),
      points,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/dashboard/ai-stats ──────────────────────────

router.get('/ai-stats', apiLimiter, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [totalRatings, avgRatingResult, lowRatedCount, knowledgeCount] = await Promise.all([
      prisma.aiRating.count(),
      prisma.aiRating.aggregate({ _avg: { rating: true } }),
      prisma.aiRating.count({ where: { rating: { lte: 2 } } }),
      prisma.knowledgeChunk.count({ where: { isActive: true } }),
    ]);

    res.json({
      totalRatings,
      avgRating: Math.round((avgRatingResult._avg.rating ?? 0) * 10) / 10,
      lowRatedCount,
      knowledgeChunks: knowledgeCount,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
