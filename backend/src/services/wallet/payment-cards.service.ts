/**
 * Saved wallet payment cards - caller-scoped CRUD over walletPaymentCards.
 *
 * A "card" is a PayMe buyer_key token captured client-side by the JSAPI
 * hosted-fields tokenize() plus display metadata. We never see or store card
 * numbers. SECURITY:
 * - Every read/write is scoped by the caller's nexusIdentityId - a caller can
 *   never touch another identity's cards (card_not_found, never a 403 that
 *   would confirm existence).
 * - The buyerKey leaves this module ONLY via getCardForCharge, which is for
 *   the server-side purchase service - never for API serialization.
 *
 * Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md s.4
 */
import { randomUUID } from 'crypto';
import type { Db } from 'mongodb';
import {
  WALLET_PAYMENT_CARDS_COLLECTION,
  type WalletPaymentCard,
} from '../../models/payments/wallet-payments.models';

/** Client-safe card projection - NO buyerKey, ever. */
export interface PaymentCardView {
  cardId: string;
  cardMask: string;
  cardBrand: string;
  expiry: string;
}

export interface AddCardInput {
  /** PayMe buyer_key token from JSAPI tokenize(). */
  token: string;
  cardMask: string;
  cardBrand: string;
  expiry: string;
}

function toView(card: WalletPaymentCard): PaymentCardView {
  return {
    cardId: card.cardId,
    cardMask: card.cardMask,
    cardBrand: card.cardBrand,
    expiry: card.expiry,
  };
}

function collection(db: Db) {
  return db.collection<WalletPaymentCard>(WALLET_PAYMENT_CARDS_COLLECTION);
}

/** Lists the caller's saved cards, newest first. */
export async function listCards(db: Db, identityId: string): Promise<PaymentCardView[]> {
  const cards = await collection(db).find({ identityId }).sort({ createdAt: -1 }).toArray();
  return cards.map(toView);
}

/** Saves a new card token for the caller. Multiple cards per user allowed. */
export async function addCard(db: Db, identityId: string, input: AddCardInput): Promise<PaymentCardView> {
  const card: WalletPaymentCard = {
    cardId: randomUUID(),
    identityId,
    buyerKey: input.token,
    cardMask: input.cardMask,
    cardBrand: input.cardBrand,
    expiry: input.expiry,
    createdAt: new Date(),
  };
  await collection(db).insertOne(card);
  return toView(card);
}

/**
 * Hard-deletes the caller's own card.
 * @throws Error('card_not_found') when the card does not exist OR belongs to
 *         someone else (identical error - no existence oracle).
 */
export async function deleteCard(db: Db, identityId: string, cardId: string): Promise<void> {
  const result = await collection(db).deleteOne({ identityId, cardId });
  if (result.deletedCount === 0) throw new Error('card_not_found');
}

/**
 * INTERNAL (purchase service only): returns the buyerKey needed to charge.
 * Never serialize this result into an API response.
 * @throws Error('card_not_found') when missing or not owned by the caller.
 */
export async function getCardForCharge(
  db: Db,
  identityId: string,
  cardId: string,
): Promise<{ cardId: string; buyerKey: string; cardMask: string }> {
  const card = await collection(db).findOne({ identityId, cardId });
  if (!card) throw new Error('card_not_found');
  return { cardId: card.cardId, buyerKey: card.buyerKey, cardMask: card.cardMask };
}
