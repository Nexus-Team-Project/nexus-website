/**
 * Read side of wallet purchases: the caller's purchase list with display
 * data (offer titles, face values, paying-card mask) + voucher payloads for
 * completed ones. Powers the wallet home flip-cards and the in-app receipt
 * page. Batch joins (one query per collection) - no N+1.
 */
import { getMongoDb } from '../../config/mongo';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import {
  WALLET_PAYMENT_CARDS_COLLECTION,
  WALLET_PURCHASES_COLLECTION,
  type WalletPurchase,
} from '../../models/payments/wallet-payments.models';
import { toPurchaseView, type PurchaseView, type VoucherUnitDoc } from './purchase-view.helper';

/**
 * Lists the caller's purchases (newest first): completed + refunded only
 * (failed attempts are noise; pending resolve within one request).
 */
export async function listMyPurchases(identityId: string): Promise<PurchaseView[]> {
  const db = await getMongoDb();
  const docs = await db
    .collection<WalletPurchase>(WALLET_PURCHASES_COLLECTION)
    .find({ identityId, status: { $in: ['completed', 'refunded'] } })
    .sort({ createdAt: -1 })
    .toArray();
  if (docs.length === 0) return [];

  const offerIds = [...new Set(docs.map((d) => d.offerId))];
  const codeIds = docs.flatMap((d) => d.voucherCodeIds ?? []);
  const cardIds = [...new Set(docs.map((d) => d.cardId))];
  const [offers, units, cards] = await Promise.all([
    db.collection(DOMAIN_COLLECTIONS.nexusOffers)
      .find({ offerId: { $in: offerIds } })
      .project<{ offerId: string; title: string; variants?: Array<{ variantId: string; face_value?: number }> }>({ offerId: 1, title: 1, 'variants.variantId': 1, 'variants.face_value': 1 })
      .toArray(),
    codeIds.length
      ? db.collection<VoucherUnitDoc>(DOMAIN_COLLECTIONS.voucherCodes).find({ codeId: { $in: codeIds } }).toArray()
      : Promise.resolve([] as VoucherUnitDoc[]),
    db.collection<{ cardId: string; cardMask: string }>(WALLET_PAYMENT_CARDS_COLLECTION)
      .find({ cardId: { $in: cardIds } })
      .project<{ cardId: string; cardMask: string }>({ cardId: 1, cardMask: 1 })
      .toArray(),
  ]);
  const offerMap = new Map(offers.map((o) => [o.offerId, o]));
  const unitMap = new Map(units.map((u) => [u.codeId, u]));
  const cardMaskMap = new Map(cards.map((c) => [c.cardId, c.cardMask]));

  return docs.map((d) => {
    const offer = offerMap.get(d.offerId);
    const variant = offer?.variants?.find((v) => v.variantId === d.variantId);
    const vouchers = (d.voucherCodeIds ?? [])
      .map((id) => unitMap.get(id))
      .filter((u): u is VoucherUnitDoc => Boolean(u))
      .map((u) => ({ kind: u.kind, value: u.value, code: u.code ?? null }));
    return toPurchaseView(d, {
      offerTitle: offer?.title ?? d.offerId,
      variantTitle: variant?.face_value !== undefined ? `₪${variant.face_value}` : d.variantId,
      faceValueAgorot: variant?.face_value !== undefined ? Math.round(variant.face_value * 100) : null,
      cardMask: cardMaskMap.get(d.cardId) ?? null,
      vouchers,
    });
  });
}
