/**
 * Exposes tenant member invitation lookup and acceptance routes.
 * Public lookup is safe; acceptance requires an authenticated matching user.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { invitationIdParamsSchema, inviteTokenParamsSchema } from '../schemas/domain-member.schemas';
import {
  acceptMyTenantMemberInvitationById,
  acceptTenantMemberInvitation,
  getTenantMemberInvitationPreview,
  listMyPendingTenantMemberInvitations,
} from '../services/domain-member-invitation-read.service';

const router = Router();

router.get(
  '/mine',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await listMyPendingTenantMemberInvitations(req.user!.sub);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/mine/:invitationId/accept',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { invitationId } = invitationIdParamsSchema.parse(req.params);
      const result = await acceptMyTenantMemberInvitationById(req.user!.sub, invitationId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:token',
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = inviteTokenParamsSchema.parse(req.params);
      const result = await getTenantMemberInvitationPreview(token);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:token/accept',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = inviteTokenParamsSchema.parse(req.params);
      const result = await acceptTenantMemberInvitation(req.user!.sub, token);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
