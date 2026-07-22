/**
 * Shared view types + mapper for wallet purchases: the client-facing
 * PurchaseView contract (what the wallet renders on the offer success sheet,
 * the home flip-cards, and the receipt page) and the WalletPurchase -> view
 * projection. Money stays integer agorot; the PayMe buyerKey and internal
 * ids never appear here.
 */
import type { WalletPurchase, WalletPurchaseStatus } from '../../models/payments/wallet-payments.models';

/** What the buyer redeems - a barcode value or a redemption link. */
export interface PurchaseVoucherView {
  kind: 'barcode' | 'link';
  value: string;
  code: string | null;
}

/** One purchase as the wallet client sees it. */
export interface PurchaseView {
  purchaseId: string;
  offerId: string;
  variantId: string;
  tenantId: string | null;
  offerTitle: string;
  variantTitle: string;
  /** The offer's cover image (imageUrls[0] mirror); null when the offer has none. */
  imageUrl: string | null;
  /** Units bought in this purchase. */
  quantity: number;
  /** Per-unit CHARGED price in agorot (the full face value); the total charged is priceAgorot * quantity. */
  priceAgorot: number;
  /** Per-unit cashback in agorot credited to the Nexus balance on completion (0 on pre-cashback purchases). */
  cashbackAgorot: number;
  /** Variant face value in agorot (receipt cashback row), when known. */
  faceValueAgorot: number | null;
  currency: 'ILS';
  status: WalletPurchaseStatus;
  paidAt: string | null;
  createdAt: string;
  /** Masked pan of the paying card (last-4 display); null if the card was deleted. */
  cardMask: string | null;
  /** Present when completed - the redeemable units (one per quantity). */
  vouchers: PurchaseVoucherView[];
  hasReceipt: boolean;
}

/** The voucherCodes unit fields the purchase flow touches. */
export interface VoucherUnitDoc {
  codeId: string;
  offerId: string;
  variantId: string;
  kind: 'barcode' | 'link';
  value: string;
  code?: string;
  status: string;
  assignedPurchaseId?: string;
}

/** Display extras resolved by the caller (offer/card/unit joins). */
export interface PurchaseViewExtras {
  offerTitle: string;
  variantTitle: string;
  imageUrl: string | null;
  faceValueAgorot: number | null;
  cardMask: string | null;
  vouchers: PurchaseVoucherView[];
}

/** Project a stored purchase + resolved extras into the client view. */
export function toPurchaseView(doc: WalletPurchase, extras: PurchaseViewExtras): PurchaseView {
  return {
    purchaseId: doc.purchaseId,
    offerId: doc.offerId,
    variantId: doc.variantId,
    tenantId: doc.tenantId,
    offerTitle: extras.offerTitle,
    variantTitle: extras.variantTitle,
    imageUrl: extras.imageUrl,
    quantity: doc.quantity,
    priceAgorot: doc.priceAgorot,
    cashbackAgorot: doc.cashbackAgorot ?? 0,
    faceValueAgorot: extras.faceValueAgorot,
    currency: doc.currency,
    status: doc.status,
    paidAt: doc.paidAt ? doc.paidAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    cardMask: extras.cardMask,
    vouchers: extras.vouchers,
    hasReceipt: doc.receipt?.status === 'sent',
  };
}
