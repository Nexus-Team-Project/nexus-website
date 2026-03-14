import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';

const router = Router();
router.use(authenticate, requireAdmin, apiLimiter);

// GET /api/admin/agent-requests?status=PENDING&page=1&limit=20
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = (req.query.status as string)?.toUpperCase();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where = status ? { status: status as any } : {};

    const [requests, total] = await Promise.all([
      prisma.agentRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.agentRequest.count({ where }),
    ]);

    res.json({ requests, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
});

const rejectSchema = z.object({ reason: z.string().optional() });

// POST /api/admin/agent-requests/:id/approve
router.post('/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user?.id ?? 'unknown';

    const request = await prisma.agentRequest.findUnique({ where: { id } });
    if (!request) { res.status(404).json({ error: 'Request not found' }); return; }
    if (request.status !== 'PENDING') {
      res.status(409).json({ error: `Request is already ${request.status}` });
      return;
    }

    // Execute action atomically
    await prisma.$transaction(async (tx) => {
      const payload = request.payload as any;

      if (request.action === 'BLOG_PUBLISH') {
        await tx.blogArticle.update({
          where: { id: payload.articleId },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
      } else if (request.action === 'BLOG_UPDATE_PUBLISHED') {
        const { articleId, changes } = payload;
        await tx.blogArticle.update({ where: { id: articleId }, data: changes });
      } else if (request.action === 'BLOG_UNPUBLISH') {
        await tx.blogArticle.update({
          where: { id: payload.articleId },
          data: { status: 'ARCHIVED' },
        });
      }

      await tx.agentRequest.update({
        where: { id },
        data: { status: 'EXECUTED', resolvedAt: new Date(), resolvedBy: adminId },
      });
    });

    res.json({ success: true, message: 'Request approved and executed' });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/agent-requests/:id/reject
router.post(
  '/:id/reject',
  validate(rejectSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { reason } = req.body as { reason?: string };
      const adminId = (req as any).user?.id ?? 'unknown';

      const request = await prisma.agentRequest.findUnique({ where: { id } });
      if (!request) { res.status(404).json({ error: 'Request not found' }); return; }
      if (request.status !== 'PENDING') {
        res.status(409).json({ error: `Request is already ${request.status}` });
        return;
      }

      await prisma.agentRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason ?? null,
          resolvedAt: new Date(),
          resolvedBy: adminId,
        },
      });

      res.json({ success: true, message: 'Request rejected' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
