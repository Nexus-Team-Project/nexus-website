/**
 * Receipt issuing + retrieval for wallet purchases (SUMIT documents).
 *
 * issueReceiptForPurchase is FIRE-AND-FORGET from the purchase flow: it
 * NEVER throws - any outcome is recorded on the purchase doc's `receipt`
 * field (`sent` | `failed` | `skipped`) so a purchase always succeeds or
 * fails on the payment alone, and failed receipts can be retried later.
 * SUMIT's own SendByEmail flag is unverified end-to-end, so this ALSO sends
 * our own purchase-confirmation email regardless of the SUMIT outcome above
 * (sent/failed/skipped), attaching the SUMIT PDF only when it was issued.
 *
 * getReceiptPdf is the owner-scoped read behind
 * GET /api/v1/wallet/purchases/:purchaseId/receipt - SUMIT credentials never
 * reach the frontend; the backend fetches and streams the PDF bytes.
 *
 * Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md s.6b
 */
import type { Db } from 'mongodb';
import { getMongoDb } from '../../config/mongo';
import {
  WALLET_PURCHASES_COLLECTION,
  type WalletPurchase,
  type WalletPurchaseReceipt,
} from '../../models/payments/wallet-payments.models';
import { sumitCreateReceipt, sumitGetDocumentPdf, isSumitConfigured } from '../sumit/sumit.client';
import { sendPurchaseConfirmationMessage } from '../email/wallet-purchase-confirmation-email.service';

function purchases(db: Db) {
  return db.collection<WalletPurchase>(WALLET_PURCHASES_COLLECTION);
}

async function storeReceipt(db: Db, purchaseId: string, receipt: WalletPurchaseReceipt): Promise<void> {
  await purchases(db).updateOne({ purchaseId }, { $set: { receipt } });
}

/**
 * Issues the SUMIT receipt for a COMPLETED purchase and records the outcome.
 * Never throws (fire-and-forget contract).
 *
 * @param args.cardMask used only for the last-4 digits on the receipt.
 */
export async function issueReceiptForPurchase(args: {
  purchaseId: string;
  buyerName: string;
  buyerEmail: string;
  itemName: string;
  offerTitle: string;
  variantTitle: string;
  quantity: number;
  totalShekels: number;
  paidAt: Date;
  cardMask: string;
  language: 'he' | 'en';
}): Promise<void> {
  const db = await getMongoDb();
  // Bytes of the SUMIT PDF, when issuing succeeded - attached to our own
  // confirmation email below.
  let receiptPdf: Buffer | undefined;

  try {
    if (!isSumitConfigured()) {
      console.warn(`[wallet-receipt] ${args.purchaseId} SUMIT not configured - receipt skipped`);
      await storeReceipt(db, args.purchaseId, { documentId: null, documentNumber: null, status: 'skipped' });
    } else {
      const purchase = await purchases(db).findOne({ purchaseId: args.purchaseId });
      if (!purchase || purchase.status !== 'completed') {
        console.warn(
          `[wallet-receipt] ${args.purchaseId} not eligible (status=${purchase?.status ?? 'missing'}) - receipt skipped`,
        );
        // Anomaly, not a real completed purchase - no confirmation email either.
        return;
      }

      const doc = await sumitCreateReceipt({
        customerName: args.buyerName,
        customerEmail: args.buyerEmail,
        itemName: args.itemName,
        // Purchases store integer agorot; SUMIT wants decimal shekels (per unit).
        priceShekels: purchase.priceAgorot / 100,
        quantity: args.quantity,
        cardLast4: args.cardMask.slice(-4),
        language: args.language,
        externalReference: args.purchaseId,
      });
      await storeReceipt(db, args.purchaseId, {
        documentId: doc.documentId,
        documentNumber: doc.documentNumber,
        status: 'sent',
      });
      console.info(
        `[wallet-receipt] ${args.purchaseId} receipt SENT document=${doc.documentId ?? 'n/a'} number=${doc.documentNumber ?? 'n/a'}`,
      );
      try {
        receiptPdf = await sumitGetDocumentPdf(doc.documentId);
      } catch (pdfErr) {
        console.error(`[wallet-receipt] ${args.purchaseId} could not fetch PDF for confirmation email:`, pdfErr);
      }
    }
  } catch (e) {
    console.error(
      `[wallet-receipt] issuing failed for ${args.purchaseId}: ${e instanceof Error ? e.message : String(e)}`,
    );
    try {
      await storeReceipt(db, args.purchaseId, { documentId: null, documentNumber: null, status: 'failed' });
    } catch (storeErr) {
      console.error(`[wallet-receipt] could not record failure for ${args.purchaseId}:`, storeErr);
    }
  }

  try {
    await sendPurchaseConfirmationMessage({
      to: args.buyerEmail,
      buyerName: args.buyerName,
      offerTitle: args.offerTitle,
      variantTitle: args.variantTitle,
      quantity: args.quantity,
      totalShekels: args.totalShekels,
      cardLast4: args.cardMask.slice(-4),
      paidAt: args.paidAt,
      lang: args.language,
      ...(receiptPdf && { receiptPdf }),
    });
  } catch (emailErr) {
    console.error(`[wallet-receipt] ${args.purchaseId} confirmation email failed:`, emailErr);
  }
}

/**
 * Returns the receipt PDF bytes for the CALLER'S OWN purchase.
 * @throws Error('receipt_not_found') when the purchase is not the caller's or
 *         carries no sent receipt document (single error - no oracle).
 */
export async function getReceiptPdf(identityId: string, purchaseId: string): Promise<Buffer> {
  const db = await getMongoDb();
  const purchase = await purchases(db).findOne({ purchaseId, identityId });
  if (!purchase?.receipt?.documentId || purchase.receipt.status !== 'sent') {
    throw new Error('receipt_not_found');
  }
  return sumitGetDocumentPdf(purchase.receipt.documentId);
}
