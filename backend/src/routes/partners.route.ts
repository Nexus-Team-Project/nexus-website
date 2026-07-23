import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { verifyAccessToken } from '../utils/jwt';
import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * Removes login-gated fields (discount, cashbackPct) from a partner record
 * for unauthenticated callers. Pure - exported for unit testing.
 * Input: full partner record. Output: the record without gated fields.
 */
export function stripGuestPartnerFields<T extends { discount?: unknown; cashbackPct?: unknown }>(
  partner: T,
): Omit<T, 'discount' | 'cashbackPct'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to strip gated fields
  const { discount: _d, cashbackPct: _c, ...rest } = partner;
  return rest;
}

// ─── GET /api/partners ─────────────────────────────────────
// Public: returns id, title, thumbnailUrl, categories, isActive, order
// Authenticated: also returns `discount` + `cashbackPct` fields

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

      // Strip login-gated fields for unauthenticated users
      const result = isAuthenticated ? partners : partners.map(stripGuestPartnerFields);

      res.json({ partners: result, total: result.length });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
