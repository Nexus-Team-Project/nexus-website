/**
 * Purchase routes - HTTP handlers for the /api/v1/purchase path.
 *
 * Build mode: returns mock response. Phase 4 will wire real PayMe integration
 * once the payment domain models and PayMe API client are implemented.
 * See docs.payme.io for the PayMe API reference.
 *
 * All real payment flows must use PayMe + Mongo domain models.
 * Never route new payment work through legacy Stripe or PayPlus services.
 */
import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';

const router = Router();

/**
 * POST /api/v1/purchase
 * Initiates a purchase session for an offer.
 *
 * Build mode stub: returns a mock pending response until PayMe is integrated
 * in Phase 4. The purchaseId format will change to a real PayMe session id.
 *
 * Input:  authenticated request with offerId (and optionally subOfferId) in body.
 * Output: mock purchase stub with status 'mock_pending'.
 */
router.post('/', authenticate, (_req: Request, res: Response): void => {
  res.json({
    purchaseId: `mock_${Date.now()}`,
    status: 'mock_pending',
    message: 'Purchase feature coming soon',
  });
});

export default router;
