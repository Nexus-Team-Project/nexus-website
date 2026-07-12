import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { pushService } from '../services/push.service';
import { env } from '../config/env';

const router = Router();

// Rate-limit push routes (100 req/min/IP).
router.use(apiLimiter);

/** GET /api/push/vapid-public-key — public key needed by the browser to subscribe */
router.get('/vapid-public-key', (_req, res) => {
  if (!env.VAPID_PUBLIC_KEY) {
    return res.status(404).json({ error: 'Push notifications not configured' });
  }
  res.json({ publicKey: env.VAPID_PUBLIC_KEY });
});

/** POST /api/push/subscribe — save a push subscription (requires auth) */
router.post('/subscribe', authenticate, async (req, res, next) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    const userId = (req.user as { id?: string } | undefined)?.id ?? 'anonymous';
    await pushService.subscribe(userId, subscription);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** POST /api/push/unsubscribe — remove a push subscription */
router.post('/unsubscribe', authenticate, async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint' });
    }
    await pushService.unsubscribe(endpoint);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
