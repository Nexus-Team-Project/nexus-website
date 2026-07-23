/**
 * MongoDB schema + index setup for wallet payments:
 *
 * - `walletPaymentCards`: one doc per SAVED CARD. We never store card
 *   numbers - only PayMe's buyer_key token plus display metadata (mask,
 *   brand, expiry). SECURITY: `buyerKey` must never be serialized into any
 *   API response; routes return the PaymentCardView projection only.
 *
 * - `walletPurchases`: one doc per purchase ATTEMPT of a voucher variant,
 *   carrying `quantity` units (1..PURCHASE_MAX_QUANTITY). The business rule
 *   "a customer may hold at most PURCHASE_MAX_QUANTITY units of one variant"
 *   is cumulative across their pending+completed purchases and enforced
 *   server-side in purchase.service (insert-then-recount; refunded/failed
 *   purchases free the allowance). The old 1-per-variant unique partial
 *   index (`uniq_active_purchase_per_variant` + `active` flag) was removed
 *   with the multi-quantity change.
 *
 * Account deletion: `walletPaymentCards` + `walletBalances` are hard-deleted;
 * `walletPurchases` are RETAINED as tenant/tax audit records (buyer name and
 * email are snapshotted on the doc, `buyerDeletedAt` marks the account as
 * gone) - see services/account-deletion/mongo.ts.
 * Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md
 */
import type { Db } from 'mongodb';

export const WALLET_PAYMENT_CARDS_COLLECTION = 'walletPaymentCards';
export const WALLET_PURCHASES_COLLECTION = 'walletPurchases';
export const WALLET_BALANCES_COLLECTION = 'walletBalances';

/**
 * A member's Nexus wallet balance. One doc per identity, created lazily (no
 * doc = balance 0). Amount is INTEGER AGOROT (ILS), ledger-ready: top-ups,
 * gift credits, and spend will adjust it (and later append ledger entries).
 */
export interface WalletBalance {
  identityId: string;
  balanceAgorot: number;
  currency: 'ILS';
  createdAt: Date;
  updatedAt: Date;
}

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

/**
 * Max units of one variant PER CUSTOMER - both the cap of a single purchase
 * AND the cumulative cap across a customer's pending+completed purchases of
 * that variant (enforced in purchase.service; stock still caps below it).
 */
export const PURCHASE_MAX_QUANTITY = 5;

/** One purchase of one voucher variant (quantity units) by one wallet user. */
export interface WalletPurchase {
  purchaseId: string;
  identityId: string;
  /**
   * Buyer snapshot for tenant/tax audit - stamped at purchase time so the
   * record stays meaningful after the account (identity) is deleted.
   * Absent on pre-snapshot purchases; account deletion backfills it.
   */
  buyerName?: string | null;
  buyerEmail?: string | null;
  /** Set by account deletion: the buyer's account no longer exists. */
  buyerDeletedAt?: Date;
  /** Tenant context used for pricing; null = ecosystem/default pricing. */
  tenantId: string | null;
  offerId: string;
  variantId: string;
  /** Number of voucher units bought in this purchase (1..PURCHASE_MAX_QUANTITY). */
  quantity: number;
  /** Per-unit CHARGED price in agorot (the variant's full face value); the charge total is priceAgorot * quantity. */
  priceAgorot: number;
  /**
   * Per-unit cashback in agorot (face value minus the displayed sale price),
   * credited to the buyer's Nexus balance when the purchase completes.
   * Absent on pre-cashback purchases (reads as 0).
   */
  cashbackAgorot?: number;
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

  await db.collection(WALLET_BALANCES_COLLECTION).createIndex(
    { identityId: 1 },
    { unique: true, name: 'uniq_identity_balance' },
  );
}
