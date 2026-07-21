/**
 * Receipt issuing + retrieval for wallet purchases (SUMIT documents).
 *
 * issueReceiptForPurchase is FIRE-AND-FORGET from the purchase flow: it
 * NEVER throws - any outcome is recorded on the purchase doc's `receipt`
 * field (`sent` | `failed` | `skipped`) so a purchase always succeeds or
 * fails on the payment alone, and failed receipts can be retried later.
 * SUMIT emails the receipt to the buyer itself (SendByEmail in the client).
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
  cardMask: string;
  language: 'he' | 'en';
}): Promise<void> {
  const db = await getMongoDb();
  try {
    if (!isSumitConfigured()) {
      await storeReceipt(db, args.purchaseId, { documentId: null, documentNumber: null, status: 'skipped' });
      return;
    }
    const purchase = await purchases(db).findOne({ purchaseId: args.purchaseId });
    if (!purchase || purchase.status !== 'completed') return;

    const doc = await sumitCreateReceipt({
      customerName: args.buyerName,
      customerEmail: args.buyerEmail,
      itemName: args.itemName,
      // Purchases store integer agorot; SUMIT wants decimal shekels.
      priceShekels: purchase.priceAgorot / 100,
      cardLast4: args.cardMask.slice(-4),
      language: args.language,
      externalReference: args.purchaseId,
    });
    await storeReceipt(db, args.purchaseId, {
      documentId: doc.documentId,
      documentNumber: doc.documentNumber,
      status: 'sent',
    });
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
