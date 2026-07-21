/**
 * MongoDB schema + index setup for wallet payments:
 *
 * - `walletPaymentCards`: one doc per SAVED CARD. We never store card
 *   numbers - only PayMe's buyer_key token plus display metadata (mask,
 *   brand, expiry). SECURITY: `buyerKey` must never be serialized into any
 *   API response; routes return the PaymentCardView projection only.
 *
 * - `walletPurchases`: one doc per purchase ATTEMPT of a voucher variant.
 *   The business rule "a user may buy at most ONE unit of each variant" is
 *   enforced HERE, not just in UI/service code: a unique partial index on
 *   (identityId, offerId, variantId) filtered to docs carrying `active: true`.
 *   `active` is set on insert (pending) and kept while completed/refunded;
 *   it is $unset when a purchase fails, which frees the slot for a retry.
 *
 * Both collections are covered by services/account-deletion (counts+delete).
 * Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md
 */
import type { Db } from 'mongodb';

export const WALLET_PAYMENT_CARDS_COLLECTION = 'walletPaymentCards';
export const WALLET_PURCHASES_COLLECTION = 'walletPurchases';

/** A saved card = a PayMe multi-use token + display metadata. */
export interface WalletPaymentCard {
  cardId: string;
  identityId: string;
  /** PayMe buyer_key token. NEVER expose to clients. */
  buyerKey: string;
  /** e.g. "532610******5846" - display only. */
  cardMask: string;
  /** JSAPI card vendor id: visa | mastercard | amex | diners | jcb | discover | unknown. */
  cardBrand: string;
  /** MMYY, display + future expiry warnings. */
  expiry: string;
  createdAt: Date;
}

export type WalletPurchaseStatus = 'pending' | 'completed' | 'failed' | 'refunded';

/** Receipt issuing outcome for a completed purchase (SUMIT document). */
export interface WalletPurchaseReceipt {
  documentId: number | null;
  documentNumber: number | null;
  status: 'sent' | 'failed' | 'skipped';
}

/** Max units a single purchase may buy of one variant (stock still caps it). */
export const PURCHASE_MAX_QUANTITY = 5;

/** One purchase of one voucher variant (quantity units) by one wallet user. */
export interface WalletPurchase {
  purchaseId: string;
  identityId: string;
  /** Tenant context used for pricing; null = ecosystem/default pricing. */
  tenantId: string | null;
  offerId: string;
  variantId: string;
  /** Number of voucher units bought in this purchase (1..PURCHASE_MAX_QUANTITY). */
  quantity: number;
  /** Per-unit price in agorot; the charge total is priceAgorot * quantity. */
  priceAgorot: number;
  currency: 'ILS';
  installments: number;
  cardId: string;
  paymeSaleId: string | null;
  paymeTransactionId: string | null;
  status: WalletPurchaseStatus;
  /** The claimed voucherCodes units (codeIds), set once the charge succeeds. */
  voucherCodeIds: string[];
  receipt: WalletPurchaseReceipt | null;
  createdAt: Date;
  paidAt: Date | null;
}

/** Idempotent index setup - called from the startup bootstrap (index.ts). */
export async function ensureWalletPaymentIndexes(db: Db): Promise<void> {
  await db.collection(WALLET_PAYMENT_CARDS_COLLECTION).createIndex({ identityId: 1 }, { name: 'identity_lookup' });

  const purchases = db.collection(WALLET_PURCHASES_COLLECTION);
  await purchases.createIndex({ identityId: 1, status: 1, createdAt: -1 }, { name: 'identity_status_lookup' });
  await purchases.createIndex({ paymeSaleId: 1 }, { name: 'payme_sale_lookup' });
}
