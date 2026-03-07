import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getInviteByToken, acceptInvite } from '../services/org.service';

const router = Router();

// ─── GET /api/invites/:token — Get invite info (public) ──────────
router.get(
  '/:token',
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invite = await getInviteByToken(req.params.token);
      // Return only safe public info
      res.json({
        id: invite.id,
        token: invite.token,
        role: invite.role,
        label: invite.label,
        org: invite.org,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        useCount: invite.useCount,
      });
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status) { res.status(e.status).json({ error: e.message }); return; }
      next(err);
    }
  },
);

// ─── POST /api/invites/:token/accept — Accept invite (authenticated) ──
router.post(
  '/:token/accept',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await acceptInvite(req.params.token, req.user!.sub);
      res.json(result);
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status) { res.status(e.status).json({ error: e.message }); return; }
      next(err);
    }
  },
);

export default router;
