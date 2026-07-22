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
 *   6. Receipt issuing (SUMIT) is fire-and-forget - a receipt failure never
 *      fails a purchase (purchase-receipt.service).
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
  PURCHASE_MAX_QUANTITY,
  WALLET_PURCHASES_COLLECTION,
  type WalletPurchase,
  type WalletPurchaseStatus,
} from '../../models/payments/wallet-payments.models';
import { paymeChargeToken, isPaymeConfigured, PaymeError } from '../payme/payme.client';
import { getCardForCharge } from './payment-cards.service';
import { resolvePurchaseOffer } from './purchase-pricing.helper';
import { issueReceiptForPurchase } from './purchase-receipt.service';
import { toPurchaseView, type PurchaseView, type VoucherUnitDoc } from './purchase-view.helper';

/** Single seam for the future multi-installment support (spec: 1 for now). */
export const PURCHASE_INSTALLMENTS = 1;

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
  await purchases(db).updateOne({ purchaseId }, { $set: { status: 'failed' } });
}

/** Return every unit claimed by a purchase back to the available pool. */
async function releaseUnitsForPurchase(db: Db, purchaseId: string): Promise<void> {
  await voucherUnits(db).updateMany(
    { assignedPurchaseId: purchaseId },
    { $set: { status: 'available', updatedAt: new Date() }, $unset: { assignedPurchaseId: '' } },
  );
}

/**
 * Atomically claim `quantity` available units of a variant for a purchase.
 * Returns the claimed unit docs, or null when fewer than `quantity` are
 * available (any partially-claimed units are released before returning).
 */
async function claimUnits(
  db: Db,
  args: { offerId: string; variantId: string; purchaseId: string; quantity: number },
): Promise<VoucherUnitDoc[] | null> {
  const claimed: VoucherUnitDoc[] = [];
  for (let i = 0; i < args.quantity; i += 1) {
    const unit = await voucherUnits(db).findOneAndUpdate(
      { offerId: args.offerId, variantId: args.variantId, status: 'available' },
      { $set: { status: 'assigned', assignedPurchaseId: args.purchaseId, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!unit) {
      await releaseUnitsForPurchase(db, args.purchaseId);
      return null;
    }
    claimed.push(unit);
  }
  return claimed;
}

/**
 * Buys `quantity` units of one voucher variant with a saved card.
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
  quantity: number;
  language: 'he' | 'en';
}): Promise<PurchaseView> {
  const db = await getMongoDb();
  if (!isPaymeConfigured()) throw new Error('payment_unavailable');

  const quantity = Math.floor(args.quantity);
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > PURCHASE_MAX_QUANTITY) {
    throw new Error('invalid_quantity');
  }

  // 1. Card ownership (throws card_not_found) + 2. server-side pricing.
  const card = await getCardForCharge(db, args.identityId, args.cardId);
  const offer = await resolvePurchaseOffer(db, {
    identityId: args.identityId,
    offerId: args.offerId,
    variantId: args.variantId,
    tenantId: args.tenantId,
  });
  const totalAgorot = offer.priceAgorot * quantity;

  // 3. Pending purchase doc.
  const purchaseId = randomUUID();
  const doc: WalletPurchase = {
    purchaseId,
    identityId: args.identityId,
    tenantId: offer.tenantId,
    offerId: args.offerId,
    variantId: args.variantId,
    quantity,
    priceAgorot: offer.priceAgorot,
    currency: 'ILS',
    installments: PURCHASE_INSTALLMENTS,
    cardId: card.cardId,
    paymeSaleId: null,
    paymeTransactionId: null,
    status: 'pending',
    voucherCodeIds: [],
    receipt: null,
    createdAt: new Date(),
    paidAt: null,
  };
  await purchases(db).insertOne(doc);

  // 4. Claim `quantity` units BEFORE charging - never charge without stock.
  const units = await claimUnits(db, { offerId: args.offerId, variantId: args.variantId, purchaseId, quantity });
  if (!units) {
    await markFailed(db, purchaseId);
    throw new Error('out_of_stock');
  }
  const voucherCodeIds = units.map((u) => u.codeId);

  // 5. Charge the saved token for the full quantity.
  try {
    const productName = quantity > 1 ? `${offer.offerTitle} x${quantity}` : offer.offerTitle;
    const sale = await paymeChargeToken({
      buyerKey: card.buyerKey,
      priceAgorot: totalAgorot,
      currency: 'ILS',
      productName,
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
          voucherCodeIds,
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
        quantity,
        cardMask: card.cardMask,
        language: args.language,
      });
    }

    return toPurchaseView(
      { ...doc, status: 'completed', paymeSaleId: sale.paymeSaleId, paymeTransactionId: sale.paymeTransactionId, voucherCodeIds, paidAt },
      {
        offerTitle: offer.offerTitle,
        variantTitle: offer.variantTitle,
        faceValueAgorot: offer.faceValueAgorot,
        cardMask: card.cardMask,
        vouchers: units.map((u) => ({ kind: u.kind, value: u.value, code: u.code ?? null })),
      },
    );
  } catch (e) {
    await releaseUnitsForPurchase(db, purchaseId);
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
 * Reconciles one PayMe IPN callback (x-www-form-urlencoded body, already
 * parsed to a string map). Matching is strict: our purchaseId
 * (transaction_id) must exist AND the callback's payme_sale_id + price must
 * equal what WE stored - a mismatched or unknown callback is logged and
 * ignored (never trusted). Idempotent per notify_type. Never throws - the
 * route always answers 200 so PayMe stops retrying.
 */
export async function handlePaymeCallback(body: Record<string, string>): Promise<void> {
  try {
    const purchaseId = body.transaction_id ?? '';
    const notifyType = body.notify_type ?? '';
    if (!purchaseId || !notifyType) return;

    const db = await getMongoDb();
    const purchase = await purchases(db).findOne({ purchaseId });
    if (!purchase) {
      console.warn(`[payme-callback] unknown purchase ${purchaseId} (${notifyType}) - ignored`);
      return;
    }
    const price = Number(body.price ?? '');
    const saleId = body.payme_sale_id ?? '';
    const saleMatches = !purchase.paymeSaleId || purchase.paymeSaleId === saleId;
    // PayMe reports the full charge (unit price x quantity); match on the total.
    const expectedTotal = purchase.priceAgorot * purchase.quantity;
    if (price !== expectedTotal || !saleId || !saleMatches) {
      console.warn(`[payme-callback] mismatch for ${purchaseId}: price=${price} sale=${saleId} - ignored`);
      return;
    }

    if (notifyType === 'sale-complete' && purchase.status === 'pending') {
      // The synchronous charge path may have raced or crashed - finish it here.
      const units = await voucherUnits(db).find({ assignedPurchaseId: purchaseId }).toArray();
      await purchases(db).updateOne(
        { purchaseId, status: 'pending' },
        {
          $set: {
            status: 'completed' satisfies WalletPurchaseStatus,
            paymeSaleId: saleId,
            paymeTransactionId: body.payme_transaction_id ?? null,
            ...(units.length ? { voucherCodeIds: units.map((u) => u.codeId) } : {}),
            paidAt: new Date(),
          },
        },
      );
    } else if (notifyType === 'sale-failure' && purchase.status === 'pending') {
      await releaseUnitsForPurchase(db, purchaseId);
      await markFailed(db, purchaseId);
    } else if (notifyType === 'refund' && purchase.status === 'completed') {
      // Refund policy is a pending management decision - mark refunded only.
      await purchases(db).updateOne(
        { purchaseId },
        { $set: { status: 'refunded' satisfies WalletPurchaseStatus } },
      );
    }
  } catch (e) {
    console.error('[payme-callback] handler error (ignored, 200 returned):', e);
  }
}
