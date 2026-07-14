/**
 * TEMPORARY wallet dev-only routes. Not part of the product API surface.
 *
 *   POST /api/v1/wallet/dev/self-delete - permanently deletes the AUTHENTICATED
 *   caller's own login (Prisma) and all linked Mongo domain data - the same
 *   cleanup as `scripts/delete-login-user.ts --apply`, scoped to the caller's
 *   own email so nobody can delete another account through this route.
 *
 * HARD-DISABLED in production (404 for everyone, no exceptions) - this exists
 * only so wallet developers can reset their own test account from the UI
 * while comparing the old and new wallet in local dev. Remove this route (and
 * the wallet button/dialog that calls it) once that comparison work is done.
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { deletePrismaLoginUser } from '../services/account-deletion/prisma';
import { deleteMongoUser } from '../services/account-deletion/mongo';

const router = Router();

router.use(apiLimiter);

router.post('/self-delete', authenticate, async (req: Request, res: Response) => {
  if (env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const email = req.user!.email.toLowerCase().trim();
  try {
    const prismaUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, fullName: true },
    });
    await deleteMongoUser(email, prismaUser);
    await deletePrismaLoginUser(prisma, email);
    console.info(`[wallet-dev] POST /self-delete -> ok (deleted ${email})`);
    res.json({ deleted: true });
  } catch (e) {
    console.error('[wallet-dev] POST /self-delete -> 500', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
