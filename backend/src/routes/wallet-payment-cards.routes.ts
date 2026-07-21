/**
 * Wallet saved payment-cards routes (mounted under /api/v1/wallet):
 *
 * GET    /payment-cards          - the caller's saved cards (view: no buyerKey)
 * POST   /payment-cards          - save a new card token from JSAPI tokenize()
 * DELETE /payment-cards/:cardId  - hard-delete the caller's own card
 *
 * Strictly caller-scoped (authenticate is sufficient per the backend gating
 * rule - these touch only the caller's own data). The identity is resolved
 * from the authenticated email exactly like the other wallet routes; the
 * PayMe buyerKey token is validated in shape but NEVER echoed back.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { getIdentityDomainCollections } from '../models/domain';
import { listCards, addCard, deleteCard } from '../services/wallet/payment-cards.service';

const router = Router();

router.use(apiLimiter);

/** JSAPI card vendor ids (card-type-changed event values). */
const CARD_BRANDS = ['unknown', 'visa', 'mastercard', 'amex', 'diners', 'jcb', 'discover'] as const;

const addCardSchema = z.object({
  // PayMe buyer_key, e.g. BUYER154-0987247Y-MLJ10OI7-LXRDNDYP
  token: z.string().regex(/^[A-Z0-9-]{20,64}$/),
  // Masked pan, digits + asterisks only, e.g. 532610******5846
  cardMask: z.string().regex(/^[\d*]{8,20}$/),
  cardBrand: z.enum(CARD_BRANDS),
  // MMYY
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\d{2}$/),
});

const cardIdSchema = z.string().uuid();

/** Resolves the caller's nexusIdentityId from the authenticated email. */
async function getCallingNexusIdentityId(req: Request): Promise<string | null> {
  const email = req.user!.email.toLowerCase().trim();
  const db = await getMongoDb();
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const doc = await nexusIdentities.findOne(
    { normalizedEmail: email },
    { projection: { nexusIdentityId: 1 } },
  );
  return doc?.nexusIdentityId ?? null;
}

router.get('/payment-cards', authenticate, async (req: Request, res: Response) => {
  try {
    const identityId = await getCallingNexusIdentityId(req);
    if (!identityId) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const db = await getMongoDb();
    res.json({ cards: await listCards(db, identityId) });
  } catch (e) {
    console.error('[wallet-payment-cards] list failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/payment-cards', authenticate, async (req: Request, res: Response) => {
  const parsed = addCardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_card_payload' });
    return;
  }
  try {
    const identityId = await getCallingNexusIdentityId(req);
    if (!identityId) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const db = await getMongoDb();
    const card = await addCard(db, identityId, parsed.data);
    res.status(201).json({ card });
  } catch (e) {
    console.error('[wallet-payment-cards] add failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.delete('/payment-cards/:cardId', authenticate, async (req: Request, res: Response) => {
  const parsed = cardIdSchema.safeParse(req.params.cardId);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_card_id' });
    return;
  }
  try {
    const identityId = await getCallingNexusIdentityId(req);
    if (!identityId) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const db = await getMongoDb();
    await deleteCard(db, identityId, parsed.data);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'card_not_found') {
      res.status(404).json({ error: 'card_not_found' });
      return;
    }
    console.error('[wallet-payment-cards] delete failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
