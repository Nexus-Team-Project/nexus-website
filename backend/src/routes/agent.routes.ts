import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateAgent } from '../middleware/authenticateAgent';
import { prisma } from '../config/database';
import { env } from '../config/env';

const router = Router();

/** Agent-specific rate limiter: 200 req/min */
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: 'Agent rate limit exceeded (200 req/min)' }),
});

// All agent routes require agent key + rate limiting
router.use(authenticateAgent, agentLimiter);

// ─── Health Check ──────────────────────────────────────────
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    gateway: 'nexus-website',
    timestamp: new Date().toISOString(),
  });
});

// ─── Pages (read-only for agent) ───────────────────────────
// These endpoints expose page metadata for SEO analysis.
// The agent reads this data to analyze and propose changes.

router.get('/pages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Return pages with basic SEO-relevant metadata
    // Adapt this to your actual page/content model
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    // If you have a Page or Content model, query it here.
    // For now, return a placeholder structure.
    res.json({
      pages: [],
      total: 0,
      limit,
      offset,
      message: 'Connect to your CMS/page model to return actual pages',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/pages/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Return full page content + SEO metadata for a specific page
    res.json({
      id,
      message: 'Connect to your CMS/page model to return page details',
    });
  } catch (err) {
    next(err);
  }
});

// ─── SEO Metadata (agent can update) ───────────────────────
router.put('/pages/:id/seo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { metaTitle, metaDesc, h1, schemaJson } = req.body;

    // Validate input
    if (metaTitle && metaTitle.length > 70) {
      res.status(400).json({ error: 'Meta title must be <= 70 characters' });
      return;
    }
    if (metaDesc && metaDesc.length > 170) {
      res.status(400).json({ error: 'Meta description must be <= 170 characters' });
      return;
    }

    // TODO: Update the actual page SEO metadata in your CMS/DB
    res.json({
      id,
      updated: true,
      metaTitle,
      metaDesc,
      h1,
      schemaJson,
      message: 'Connect to your CMS/page model to apply SEO changes',
    });
  } catch (err) {
    next(err);
  }
});

// ─── Blog (read + draft creation) ──────────────────────────
router.get('/blog', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    // Return blog posts for content decay analysis
    res.json({
      posts: [],
      total: 0,
      limit,
      message: 'Connect to your blog model to return posts',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/blog/drafts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, content, metaTitle, metaDesc, slug } = req.body;

    if (!title || !content) {
      res.status(400).json({ error: 'Title and content are required' });
      return;
    }

    // TODO: Create a blog draft in your CMS
    res.status(201).json({
      draft: true,
      title,
      slug,
      message: 'Connect to your blog model to create drafts',
    });
  } catch (err) {
    next(err);
  }
});

// ─── Analytics Summary ─────────────────────────────────────
router.get('/analytics/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(Number(req.query.days) || 7, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Aggregate site analytics for the agent
    const [visitors, chats, leads] = await Promise.all([
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT "visitorId")::int AS count FROM "PageView"
        WHERE "createdAt" >= ${since}`,
      prisma.chatSession.count({ where: { createdAt: { gte: since } } }),
      prisma.lead.count({ where: { createdAt: { gte: since } } }),
    ]);

    // Top pages by views
    const topPages = await prisma.pageView.groupBy({
      by: ['pagePath'],
      _count: { id: true },
      where: { createdAt: { gte: since } },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    });

    res.json({
      period_days: days,
      unique_visitors: Number(visitors[0]?.count ?? 0),
      chat_sessions: chats,
      leads_captured: leads,
      top_pages: topPages.map((p) => ({
        path: p.pagePath,
        views: p._count.id,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
