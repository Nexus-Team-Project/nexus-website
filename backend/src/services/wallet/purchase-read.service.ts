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
import { NOT_DELETED } from '../../models/domain/supply.models';
import { toPurchaseView, type PurchaseView, type VoucherUnitDoc } from './purchase-view.helper';

/**
 * Available (unclaimed) voucher-unit counts per variant for one offer, for the
 * wallet's quantity stepper cap. Non-sensitive (numbers only, never codes);
 * returns {} for a missing/deleted/non-voucher offer. Gated by the caller
 * route to an authenticated member.
 */
export async function getAvailableVariantStock(offerId: string): Promise<Record<string, number>> {
  const db = await getMongoDb();
  const offer = await db
    .collection<{ executionType?: string }>(DOMAIN_COLLECTIONS.nexusOffers)
    .findOne({ offerId, ...NOT_DELETED }, { projection: { executionType: 1 } });
  if (!offer || (offer.executionType ?? 'voucher') !== 'voucher') return {};

  const rows = await db
    .collection(DOMAIN_COLLECTIONS.voucherCodes)
    .aggregate<{ _id: string; n: number }>([
      { $match: { offerId, status: 'available' } },
      { $group: { _id: '$variantId', n: { $sum: 1 } } },
    ])
    .toArray();
  const stock: Record<string, number> = {};
  for (const row of rows) stock[row._id] = row.n;
  return stock;
}

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
      .project<{ offerId: string; title: string; imageUrl?: string; createdByTenantId?: string; variants?: Array<{ variantId: string; face_value?: number }> }>({ offerId: 1, title: 1, imageUrl: 1, createdByTenantId: 1, 'variants.variantId': 1, 'variants.face_value': 1 })
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

  // Batch-join the CREATOR tenants (logo + name for the receipt/flip-card
  // tile) in one query; a missing doc (NEXUS platform sentinel) reads NEXUS.
  const creatorIds = [...new Set(offers.map((o) => o.createdByTenantId).filter((id): id is string => Boolean(id)))];
  const creators = creatorIds.length
    ? await db
        .collection<{ tenantId: string; organizationName?: string; logoUrl?: string }>(DOMAIN_COLLECTIONS.domainTenants)
        .find({ tenantId: { $in: creatorIds } })
        .project<{ tenantId: string; organizationName?: string; logoUrl?: string }>({ tenantId: 1, organizationName: 1, logoUrl: 1 })
        .toArray()
    : [];
  const creatorMap = new Map(creators.map((c) => [c.tenantId, c]));

  return docs.map((d) => {
    const offer = offerMap.get(d.offerId);
    const variant = offer?.variants?.find((v) => v.variantId === d.variantId);
    const creator = offer?.createdByTenantId ? creatorMap.get(offer.createdByTenantId) : undefined;
    const vouchers = (d.voucherCodeIds ?? [])
      .map((id) => unitMap.get(id))
      .filter((u): u is VoucherUnitDoc => Boolean(u))
      .map((u) => ({ kind: u.kind, value: u.value, code: u.code ?? null }));
    return toPurchaseView(d, {
      offerTitle: offer?.title ?? d.offerId,
      variantTitle: variant?.face_value !== undefined ? `₪${variant.face_value}` : d.variantId,
      imageUrl: offer?.imageUrl ?? null,
      createdByTenantName: creator?.organizationName ?? 'NEXUS',
      createdByTenantLogoUrl: creator?.logoUrl ?? null,
      faceValueAgorot: variant?.face_value !== undefined ? Math.round(variant.face_value * 100) : null,
      cardMask: cardMaskMap.get(d.cardId) ?? null,
      vouchers,
    });
  });
}
