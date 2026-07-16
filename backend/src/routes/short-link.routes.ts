/**
 * Public short-link redirect route, mounted at the app root as /l (NOT under
 * /api). Resolves a base62 code to its DB-sourced target and 302-redirects.
 * The Location header only ever carries values our own services wrote to the
 * shortLinks collection, so there is no open-redirect surface. Unknown or
 * malformed codes return 404. Reuses the general apiLimiter as the light
 * rate limit required by the spec.
 * Spec: docs/superpowers/specs/2026-07-15-members-service-invite-design.md s.3, s.8
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { apiLimiter } from '../middleware/rateLimiter';
import { consumeShortLink } from '../services/short-link.service';

const router = Router();

/**
 * GET /l/:code
 * Input: base62 code path param (untrusted; validated in the service).
 * Output: 302 to the stored targetUrl, or 404 JSON when unknown.
 */
router.get(
  '/:code',
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const target = await consumeShortLink(req.params.code);
      if (!target) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.redirect(302, target);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
