import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { verifyAccessToken } from '../utils/jwt';
import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

// ─── GET /api/partners ─────────────────────────────────────
// Public: returns id, title, thumbnailUrl, categories, isActive, order
// Authenticated: also returns `discount` field

router.get(
  '/',
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Optional auth — try to read bearer token, don't fail if missing
      let isAuthenticated = false;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          verifyAccessToken(authHeader.slice(7));
          isAuthenticated = true;
        } catch {
          // invalid/expired token — treat as unauthenticated
        }
      }

      const category = req.query.category as string | undefined;

      const partners = await prisma.partner.findMany({
        where: {
          isActive: true,
          ...(category ? { categories: { has: category } } : {}),
        },
        orderBy: { order: 'asc' },
      });

      // Strip `discount` field for unauthenticated users
      const result = isAuthenticated
        ? partners
        : partners.map(({ discount: _d, ...rest }) => rest);

      res.json({ partners: result, total: result.length });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
