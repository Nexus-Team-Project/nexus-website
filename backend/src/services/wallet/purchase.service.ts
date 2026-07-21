/**
 * Wallet voucher purchase service - the money path.
 *
 * Flow (claim-inventory-THEN-charge, so we never charge without stock):
 *   1. Verify the card belongs to the caller (buyerKey stays server-side).
 *   2. Resolve price + eligibility server-side (purchase-pricing.helper -
 *      the charged price always equals the displayed price).
 *   3. Insert the `pending` purchase doc - the unique partial index
 *      `uniq_active_purchase_per_variant` enforces the 1-per-variant rule
 *      (duplicate -> already_purchased).
 *   4. Atomically claim ONE available voucherCodes unit (available->assigned).
 *      None -> purchase failed + out_of_stock (slot freed via $unset active).
 *   5. Charge the saved token via the PayMe client. Failure -> release the
 *      unit + mark failed (card_declined). Success -> completed + paidAt.
 *   6. Receipt issuing (SUMIT) is fire-and-forget - wired in
 *      purchase-receipt.service; a receipt failure never fails a purchase.
 *
 * The IPN callback reconciliation (handlePaymeCallback) lives with the routes
 * task and reuses the same collections.
 *
 * Throws stable-coded Errors: card_not_found | offer_not_found |
 * variant_not_found | not_purchasable | no_catalog_access |
 * already_purchased | out_of_stock | card_declined | payment_unavailable.
 */
import { randomUUID } from 'crypto';
import type { Db } from 'mongodb';
import { getMongoDb } from '../../config/mongo';
import { env } from '../../config/env';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import {
  WALLET_PURCHASES_COLLECTION,
  type WalletPurchase,
  type WalletPurchaseStatus,
} from '../../models/payments/wallet-payments.models';
import { paymeChargeToken, isPaymeConfigured, PaymeError } from '../payme/payme.client';
import { getCardForCharge } from './payment-cards.service';
import { resolvePurchaseOffer } from './purchase-pricing.helper';
import { issueReceiptForPurchase } from './purchase-receipt.service';

/** Single seam for the future multi-installment support (spec: 1 for now). */
export const PURCHASE_INSTALLMENTS = 1;

export interface PurchaseVoucherView {
  kind: 'barcode' | 'link';
  value: string;
  code: string | null;
}

export interface PurchaseView {
  purchaseId: string;
  offerId: string;
  variantId: string;
  tenantId: string | null;
  offerTitle: string;
  variantTitle: string;
  priceAgorot: number;
  currency: 'ILS';
  status: WalletPurchaseStatus;
  paidAt: string | null;
  createdAt: string;
  /** Present when completed - what the buyer redeems. */
  voucher: PurchaseVoucherView | null;
  hasReceipt: boolean;
}

interface VoucherUnitDoc {
  codeId: string;
  offerId: string;
  variantId: string;
  kind: 'barcode' | 'link';
  value: string;
  code?: string;
  status: string;
  assignedPurchaseId?: string;
}

/** Public URL PayMe posts the IPN to (env seam; tunnel in dev). */
export function paymeCallbackUrl(): string {
  const base = process.env.PAYME_CALLBACK_BASE_URL
    ?? env.PAYME_CALLBACK_BASE_URL
    ?? process.env.BACKEND_URL
    ?? env.BACKEND_URL
    ?? 'http://localhost:3001';
  return `${base.replace(/\/$/, '')}/api/v1/payments/payme/callback`;
}

function purchases(db: Db) {
  return db.collection<WalletPurchase>(WALLET_PURCHASES_COLLECTION);
}
function voucherUnits(db: Db) {
  return db.collection<VoucherUnitDoc>(DOMAIN_COLLECTIONS.voucherCodes);
}

async function markFailed(db: Db, purchaseId: string): Promise<void> {
  await purchases(db).updateOne(
    { purchaseId },
    { $set: { status: 'failed' }, $unset: { active: '' } },
  );
}

async function releaseUnit(db: Db, codeId: string): Promise<void> {
  await voucherUnits(db).updateOne(
    { codeId },
    { $set: { status: 'available', updatedAt: new Date() }, $unset: { assignedPurchaseId: '' } },
  );
}

function toView(doc: WalletPurchase, extras: {
  offerTitle: string;
  variantTitle: string;
  voucher: PurchaseVoucherView | null;
}): PurchaseView {
  return {
    purchaseId: doc.purchaseId,
    offerId: doc.offerId,
    variantId: doc.variantId,
    tenantId: doc.tenantId,
    offerTitle: extras.offerTitle,
    variantTitle: extras.variantTitle,
    priceAgorot: doc.priceAgorot,
    currency: doc.currency,
    status: doc.status,
    paidAt: doc.paidAt ? doc.paidAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    voucher: extras.voucher,
    hasReceipt: doc.receipt?.status === 'sent',
  };
}

/**
 * Buys ONE unit of one voucher variant with a saved card.
 * See the module doc for the exact flow + error codes.
 */
export async function createPurchase(args: {
  identityId: string;
  email: string | null;
  name: string | null;
  offerId: string;
  variantId: string;
  cardId: string;
  tenantId: string | null;
  language: 'he' | 'en';
}): Promise<PurchaseView> {
  const db = await getMongoDb();
  if (!isPaymeConfigured()) throw new Error('payment_unavailable');

  // 1. Card ownership (throws card_not_found) + 2. server-side pricing.
  const card = await getCardForCharge(db, args.identityId, args.cardId);
  const offer = await resolvePurchaseOffer(db, {
    identityId: args.identityId,
    offerId: args.offerId,
    variantId: args.variantId,
    tenantId: args.tenantId,
  });

  // 3. Pending purchase doc - the unique index enforces 1-per-variant.
  const purchaseId = randomUUID();
  const doc: WalletPurchase = {
    purchaseId,
    identityId: args.identityId,
    tenantId: offer.tenantId,
    offerId: args.offerId,
    variantId: args.variantId,
    priceAgorot: offer.priceAgorot,
    currency: 'ILS',
    installments: PURCHASE_INSTALLMENTS,
    cardId: card.cardId,
    paymeSaleId: null,
    paymeTransactionId: null,
    status: 'pending',
    active: true,
    voucherCodeId: null,
    receipt: null,
    createdAt: new Date(),
    paidAt: null,
  };
  try {
    await purchases(db).insertOne(doc);
  } catch (e) {
    if (e instanceof Error && 'code' in e && (e as { code?: number }).code === 11000) {
      throw new Error('already_purchased');
    }
    throw e;
  }

  // 4. Claim inventory BEFORE charging - never charge without stock.
  const unit = await voucherUnits(db).findOneAndUpdate(
    { offerId: args.offerId, variantId: args.variantId, status: 'available' },
    { $set: { status: 'assigned', assignedPurchaseId: purchaseId, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!unit) {
    await markFailed(db, purchaseId);
    throw new Error('out_of_stock');
  }

  // 5. Charge the saved token.
  try {
    const sale = await paymeChargeToken({
      buyerKey: card.buyerKey,
      priceAgorot: offer.priceAgorot,
      currency: 'ILS',
      productName: offer.offerTitle,
      transactionId: purchaseId,
      callbackUrl: paymeCallbackUrl(),
      installments: PURCHASE_INSTALLMENTS,
      language: args.language,
      ...(args.name ? { buyerName: args.name } : {}),
      ...(args.email ? { buyerEmail: args.email } : {}),
    });
    const paidAt = new Date();
    await purchases(db).updateOne(
      { purchaseId },
      {
        $set: {
          status: 'completed' satisfies WalletPurchaseStatus,
          paymeSaleId: sale.paymeSaleId,
          paymeTransactionId: sale.paymeTransactionId,
          voucherCodeId: unit.codeId,
          paidAt,
        },
      },
    );
    // 6. Receipt: fire-and-forget - a receipt failure never fails a purchase.
    if (args.email) {
      void issueReceiptForPurchase({
        purchaseId,
        buyerName: args.name ?? args.email,
        buyerEmail: args.email,
        itemName: `${offer.offerTitle} ${offer.variantTitle}`,
        cardMask: card.cardMask,
        language: args.language,
      });
    }

    return toView(
      { ...doc, status: 'completed', paymeSaleId: sale.paymeSaleId, paymeTransactionId: sale.paymeTransactionId, voucherCodeId: unit.codeId, paidAt },
      {
        offerTitle: offer.offerTitle,
        variantTitle: offer.variantTitle,
        voucher: { kind: unit.kind, value: unit.value, code: unit.code ?? null },
      },
    );
  } catch (e) {
    await releaseUnit(db, unit.codeId);
    await markFailed(db, purchaseId);
    if (e instanceof PaymeError && e.code !== 'charge_failed') {
      // configuration/transport problems are not the buyer's card's fault
      console.error(`[wallet-purchase] charge transport failure for ${purchaseId}: ${e.code}`);
      throw new Error('payment_unavailable');
    }
    throw new Error('card_declined');
  }
}

/**
 * Lists the caller's purchases (newest first) with display data + voucher
 * payloads for completed ones. Powers the wallet home flip-cards.
 */
export async function listMyPurchases(identityId: string): Promise<PurchaseView[]> {
  const db = await getMongoDb();
  const docs = await purchases(db)
    .find({ identityId, status: { $in: ['completed', 'refunded'] } })
    .sort({ createdAt: -1 })
    .toArray();
  if (docs.length === 0) return [];

  const offerIds = [...new Set(docs.map((d) => d.offerId))];
  const codeIds = docs.map((d) => d.voucherCodeId).filter((id): id is string => Boolean(id));
  const [offers, units] = await Promise.all([
    db.collection(DOMAIN_COLLECTIONS.nexusOffers)
      .find({ offerId: { $in: offerIds } })
      .project<{ offerId: string; title: string; variants?: Array<{ variantId: string; face_value?: number }> }>({ offerId: 1, title: 1, 'variants.variantId': 1, 'variants.face_value': 1 })
      .toArray(),
    codeIds.length
      ? voucherUnits(db).find({ codeId: { $in: codeIds } }).toArray()
      : Promise.resolve([] as VoucherUnitDoc[]),
  ]);
  const offerMap = new Map(offers.map((o) => [o.offerId, o]));
  const unitMap = new Map(units.map((u) => [u.codeId, u]));

  return docs.map((d) => {
    const offer = offerMap.get(d.offerId);
    const variant = offer?.variants?.find((v) => v.variantId === d.variantId);
    const unit = d.voucherCodeId ? unitMap.get(d.voucherCodeId) : undefined;
    return toView(d, {
      offerTitle: offer?.title ?? d.offerId,
      variantTitle: variant?.face_value !== undefined ? `₪${variant.face_value}` : d.variantId,
      voucher: unit ? { kind: unit.kind, value: unit.value, code: unit.code ?? null } : null,
    });
  });
}
