/**
 * PayMe IPN callback route: POST /api/v1/payments/payme/callback
 *
 * PUBLIC (no auth - PayMe's servers call it) with a route-level urlencoded
 * parser (PayMe posts x-www-form-urlencoded). Rate-limited. ALWAYS answers
 * 200: PayMe retries non-200 responses, and the handler treats every
 * mismatched/unknown payload as ignorable, so surfacing errors would only
 * cause retry storms. Integrity is NOT the transport's job here - the
 * handler matches the callback against a purchase WE created (purchaseId +
 * payme_sale_id + exact price) and ignores everything else.
 */
import { Router, Request, Response, urlencoded } from 'express';
import { apiLimiter } from '../middleware/rateLimiter';
import { handlePaymeCallback } from '../services/wallet/purchase.service';

const router = Router();

router.post(
  '/payme/callback',
  apiLimiter,
  urlencoded({ extended: false }),
  async (req: Request, res: Response) => {
    // Normalize the parsed body to a flat string map for the handler.
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries((req.body ?? {}) as Record<string, unknown>)) {
      if (typeof v === 'string') body[k] = v;
    }
    await handlePaymeCallback(body);
    res.status(200).send('ok');
  },
);

export default router;
