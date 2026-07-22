/**
 * Wallet voucher purchase service - the money path.
 *
 * Flow (claim-inventory-THEN-charge, so we never charge without stock):
 *   1. Verify the card belongs to the caller (buyerKey stays server-side).
 *   2. Resolve price + eligibility server-side (purchase-pricing.helper -
 *      the charge is the variant's full face value; the displayed sale price
 *      only determines the cashback).
 *   3. Insert the `pending` purchase doc, then enforce the PER-CUSTOMER cap:
 *      a customer may hold at most PURCHASE_MAX_QUANTITY units of one variant
 *      across all their pending+completed purchases (refunded/failed free the
 *      allowance). The recount runs AFTER the insert so two concurrent
 *      purchases see each other's pending docs - over the cap -> the new
 *      purchase is marked failed (quantity_limit) before anything is charged.
 *   4. Atomically claim `quantity` available voucherCodes units
 *      (available->assigned). Not enough -> purchase failed + out_of_stock.
 *   5. Charge the saved token via the PayMe client for the FULL FACE VALUE
 *      (see purchase-pricing.helper). Failure -> release the units + mark
 *      failed (card_declined). Success -> completed + paidAt.
 *   6. CASHBACK: the gap between the face value paid and the displayed sale
 *      price is credited to the buyer's Nexus balance. Guarded by the
 *      pending->completed transition so the sync path and the IPN fallback
 *      never double-credit; a failed credit never fails the purchase
 *      (creditPurchaseCashback logs it for reconciliation).
 *   7. Receipt issuing (SUMIT) is fire-and-forget - a receipt failure never
 *      fails a purchase (purchase-receipt.service).
 *
 * Throws stable-coded Errors: card_not_found | offer_not_found |
 * variant_not_found | not_purchasable | no_catalog_access | invalid_quantity |
 * quantity_limit | out_of_stock | card_declined | payment_unavailable.
 */
import { randomUUID } from 'crypto';
import { getMongoDb } from '../../config/mongo';
import { env } from '../../config/env';
import {
  PURCHASE_MAX_QUANTITY,
  type WalletPurchase,
  type WalletPurchaseStatus,
} from '../../models/payments/wallet-payments.models';
import { paymeChargeToken, isPaymeConfigured, PaymeError } from '../payme/payme.client';
import {
  VERIFIED_NOTIFY_TYPES,
  verifyIpnAgainstPayme,
  type VerifiedNotifyType,
} from './payme-ipn-verify.helper';
import { creditPurchaseCashback } from './balance.service';
import { getCardForCharge } from './payment-cards.service';
import { claimUnits, markFailed, purchases, releaseUnitsForPurchase, voucherUnits } from './purchase-inventory.helper';
import { assertCustomerVariantCap } from './purchase-quantity.helper';
import { resolvePurchaseOffer } from './purchase-pricing.helper';
import { issueReceiptForPurchase } from './purchase-receipt.service';
import { toPurchaseView, type PurchaseView } from './purchase-view.helper';

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
    cashbackAgorot: offer.cashbackAgorot,
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
  console.info(
    `[wallet-purchase] ${purchaseId} START identity=${args.identityId} offer=${args.offerId} variant=${args.variantId} qty=${quantity} unitPrice=${offer.priceAgorot} total=${totalAgorot} unitCashback=${offer.cashbackAgorot} card=${card.cardId} tenant=${offer.tenantId ?? 'ecosystem'}`,
  );

  // Per-customer cap (max PURCHASE_MAX_QUANTITY units of this variant across
  // pending+completed purchases) - see purchase-quantity.helper for the
  // insert-then-recount race reasoning. Throws quantity_limit.
  await assertCustomerVariantCap(db, {
    identityId: args.identityId,
    offerId: args.offerId,
    variantId: args.variantId,
    purchaseId,
    quantity,
  });

  // 4. Claim `quantity` units BEFORE charging - never charge without stock.
  const units = await claimUnits(db, { offerId: args.offerId, variantId: args.variantId, purchaseId, quantity });
  if (!units) {
    console.warn(`[wallet-purchase] ${purchaseId} OUT OF STOCK (wanted ${quantity}) - marked failed, nothing charged`);
    await markFailed(db, purchaseId);
    throw new Error('out_of_stock');
  }
  const voucherCodeIds = units.map((u) => u.codeId);
  console.info(`[wallet-purchase] ${purchaseId} claimed ${units.length} unit(s): ${voucherCodeIds.join(',')}`);

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
    // Guard on `pending` so a racing IPN completion wins exactly once - the
    // cashback credit below runs only for the path that made the transition.
    const completion = await purchases(db).updateOne(
      { purchaseId, status: 'pending' },
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
    console.info(
      `[wallet-purchase] ${purchaseId} COMPLETED sale=${sale.paymeSaleId} status=${sale.saleStatus} charged=${totalAgorot} agorot`,
    );
    // 6. Cashback: the buyer paid the full face value - credit the gap to
    // their Nexus balance (best-effort; never fails the purchase).
    if (completion.modifiedCount === 1) {
      await creditPurchaseCashback({
        identityId: args.identityId,
        purchaseId,
        cashbackAgorot: offer.cashbackAgorot * quantity,
      });
    }
    // 7. Receipt + confirmation email: fire-and-forget - neither failure
    // fails a purchase.
    if (args.email) {
      void issueReceiptForPurchase({
        purchaseId,
        buyerName: args.name ?? args.email,
        buyerEmail: args.email,
        itemName: `${offer.offerTitle} ${offer.variantTitle}`,
        offerTitle: offer.offerTitle,
        variantTitle: offer.variantTitle,
        quantity,
        totalShekels: totalAgorot / 100,
        paidAt,
        cardMask: card.cardMask,
        language: args.language,
      });
    }

    return toPurchaseView(
      { ...doc, status: 'completed', paymeSaleId: sale.paymeSaleId, paymeTransactionId: sale.paymeTransactionId, voucherCodeIds, paidAt },
      {
        offerTitle: offer.offerTitle,
        variantTitle: offer.variantTitle,
        imageUrl: offer.imageUrl,
        createdByTenantName: offer.createdByTenantName,
        createdByTenantLogoUrl: offer.createdByTenantLogoUrl,
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
      console.error(`[wallet-purchase] ${purchaseId} charge TRANSPORT FAILURE (${e.code}) - units released, marked failed`);
      throw new Error('payment_unavailable');
    }
    console.warn(
      `[wallet-purchase] ${purchaseId} charge DECLINED (${e instanceof PaymeError ? e.code : 'unknown_error'}) - units released, marked failed`,
    );
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
    console.info(
      `[payme-callback] received notify=${notifyType || 'n/a'} purchase=${purchaseId || 'n/a'} sale=${body.payme_sale_id ?? 'n/a'} price=${body.price ?? 'n/a'} sale_status=${body.sale_status ?? 'n/a'}`,
    );
    if (!purchaseId || !notifyType) {
      console.warn('[payme-callback] missing transaction_id/notify_type - ignored');
      return;
    }
    // Only three notify types have any effect - skip the rest before doing work.
    if (!(VERIFIED_NOTIFY_TYPES as readonly string[]).includes(notifyType)) {
      console.info(`[payme-callback] notify=${notifyType} is not actionable - ignored`);
      return;
    }

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
      console.warn(
        `[payme-callback] ${purchaseId} basic-match FAILED: price=${price} expected=${expectedTotal} sale=${saleId || 'n/a'} storedSale=${purchase.paymeSaleId ?? 'unset'} - ignored`,
      );
      return;
    }

    // Server-to-server verification: the callback payload is untrusted, so
    // confirm the sale's real state with PayMe before acting. A contradiction
    // is the forgery signal - ignored everywhere. When verification cannot
    // run (network/env), production fails CLOSED (a lost real IPN is
    // recoverable - the sync charge path is the primary source of truth and
    // PayMe retries non-processed sales appear on reconciliation), while
    // sandbox/dev/test fail OPEN so tunnel-based testing keeps working.
    const verification = await verifyIpnAgainstPayme({
      notifyType: notifyType as VerifiedNotifyType,
      paymeSaleId: saleId,
      expectedPriceAgorot: expectedTotal,
    });
    if (verification === 'mismatch') {
      console.warn(
        `[payme-callback] ${purchaseId} verification MISMATCH: PayMe records contradict ${notifyType} for sale=${saleId} - ignored (possible forgery)`,
      );
      return;
    }
    if (verification === 'unavailable') {
      if (env.NODE_ENV === 'production') {
        console.warn(`[payme-callback] ${purchaseId} verification UNAVAILABLE - ignored (production fails closed)`);
        return;
      }
      console.warn(`[payme-callback] ${purchaseId} verification UNAVAILABLE - proceeding (fail-open outside production)`);
    } else {
      console.info(`[payme-callback] ${purchaseId} verification CONFIRMED by PayMe for ${notifyType}`);
    }

    if (notifyType === 'sale-complete' && purchase.status === 'pending') {
      // The synchronous charge path may have raced or crashed - finish it here.
      const units = await voucherUnits(db).find({ assignedPurchaseId: purchaseId }).toArray();
      const result = await purchases(db).updateOne(
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
      console.info(
        result.modifiedCount === 1
          ? `[payme-callback] ${purchaseId} COMPLETED via IPN sale=${saleId} units=${units.length}`
          : `[payme-callback] ${purchaseId} sale-complete no-op (lost race, status already advanced)`,
      );
      // The IPN path made the pending->completed transition, so it owns the
      // cashback credit (the sync path's guarded update no-oped).
      if (result.modifiedCount === 1) {
        await creditPurchaseCashback({
          identityId: purchase.identityId,
          purchaseId,
          cashbackAgorot: (purchase.cashbackAgorot ?? 0) * purchase.quantity,
        });
      }
    } else if (notifyType === 'sale-failure' && purchase.status === 'pending') {
      await releaseUnitsForPurchase(db, purchaseId);
      await markFailed(db, purchaseId);
      console.info(`[payme-callback] ${purchaseId} FAILED via IPN sale=${saleId} - claimed units released`);
    } else if (notifyType === 'refund' && purchase.status === 'completed') {
      // Refund policy is a pending management decision - mark refunded only.
      await purchases(db).updateOne(
        { purchaseId },
        { $set: { status: 'refunded' satisfies WalletPurchaseStatus } },
      );
      console.info(`[payme-callback] ${purchaseId} REFUNDED via IPN sale=${saleId}`);
    } else {
      console.info(
        `[payme-callback] ${purchaseId} ${notifyType} no-op: purchase status is '${purchase.status}' (idempotency guard)`,
      );
    }
  } catch (e) {
    console.error('[payme-callback] handler error (ignored, 200 returned):', e);
  }
}
