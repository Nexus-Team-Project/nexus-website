/**
 * Wallet voucher purchase routes (mounted under /api/v1/wallet):
 *
 * POST /purchases                       - buy ONE unit of one variant with a saved card
 * GET  /purchases/mine                  - the caller's purchases (home flip-cards)
 * GET  /purchases/:purchaseId/receipt   - the caller's own receipt PDF (SUMIT proxy)
 *
 * Strictly caller-scoped: identity from the authenticated email, price
 * resolved server-side (client price is never trusted), the 1-per-variant
 * rule enforced by a unique DB index. Stable error codes map to HTTP:
 * already_purchased/out_of_stock -> 409, card_declined -> 402,
 * payment_unavailable -> 503, *_not_found -> 404, access -> 403.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { getIdentityDomainCollections } from '../models/domain';
import { PURCHASE_MAX_QUANTITY } from '../models/payments/wallet-payments.models';
import { createPurchase } from '../services/wallet/purchase.service';
import { listMyPurchases } from '../services/wallet/purchase-read.service';
import { getReceiptPdf } from '../services/wallet/purchase-receipt.service';

const router = Router();

router.use(apiLimiter);

const purchaseBodySchema = z.object({
  offerId: z.string().min(1).max(128),
  variantId: z.string().min(1).max(128),
  cardId: z.string().uuid(),
  tenantId: z.string().min(1).max(128).optional(),
  quantity: z.number().int().min(1).max(PURCHASE_MAX_QUANTITY).default(1),
  language: z.enum(['he', 'en']).default('he'),
});

const purchaseIdSchema = z.string().uuid();

/** Error code -> HTTP status for the purchase flow. */
const PURCHASE_ERROR_STATUS: Record<string, number> = {
  card_not_found: 404,
  offer_not_found: 404,
  variant_not_found: 404,
  not_purchasable: 409,
  no_catalog_access: 403,
  invalid_quantity: 400,
  out_of_stock: 409,
  card_declined: 402,
  payment_unavailable: 503,
};

/** Resolves the caller's identity id + display name from the auth email. */
async function getCallingIdentity(
  req: Request,
): Promise<{ identityId: string; email: string; name: string | null } | null> {
  const email = req.user!.email.toLowerCase().trim();
  const db = await getMongoDb();
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const doc = await nexusIdentities.findOne(
    { normalizedEmail: email },
    { projection: { nexusIdentityId: 1, displayName: 1, firstName: 1, lastName: 1 } },
  );
  if (!doc) return null;
  const identity = doc as { displayName?: string; firstName?: string; lastName?: string };
  const joinedName = [identity.firstName, identity.lastName].filter(Boolean).join(' ');
  const name = identity.displayName ?? (joinedName || null);
  return { identityId: doc.nexusIdentityId, email, name };
}

router.post('/purchases', authenticate, async (req: Request, res: Response) => {
  const parsed = purchaseBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_purchase_payload' });
    return;
  }
  try {
    const caller = await getCallingIdentity(req);
    if (!caller) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const purchase = await createPurchase({
      identityId: caller.identityId,
      email: caller.email,
      name: caller.name,
      offerId: parsed.data.offerId,
      variantId: parsed.data.variantId,
      cardId: parsed.data.cardId,
      tenantId: parsed.data.tenantId ?? null,
      quantity: parsed.data.quantity,
      language: parsed.data.language,
    });
    res.status(201).json({ purchase });
  } catch (e) {
    const code = e instanceof Error ? e.message : 'internal_error';
    const status = PURCHASE_ERROR_STATUS[code];
    if (status) {
      res.status(status).json({ error: code });
      return;
    }
    console.error('[wallet-purchases] create failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/purchases/mine', authenticate, async (req: Request, res: Response) => {
  try {
    const caller = await getCallingIdentity(req);
    if (!caller) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    res.json({ purchases: await listMyPurchases(caller.identityId) });
  } catch (e) {
    console.error('[wallet-purchases] list failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/purchases/:purchaseId/receipt', authenticate, async (req: Request, res: Response) => {
  const parsed = purchaseIdSchema.safeParse(req.params.purchaseId);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_purchase_id' });
    return;
  }
  try {
    const caller = await getCallingIdentity(req);
    if (!caller) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const pdf = await getReceiptPdf(caller.identityId, parsed.data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${parsed.data}.pdf"`);
    res.send(pdf);
  } catch (e) {
    if (e instanceof Error && e.message === 'receipt_not_found') {
      res.status(404).json({ error: 'receipt_not_found' });
      return;
    }
    console.error('[wallet-purchases] receipt failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
