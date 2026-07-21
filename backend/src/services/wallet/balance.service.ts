/**
 * Nexus wallet balance - a member's stored ILS balance in integer agorot.
 *
 * Balances are created LAZILY: no doc means the member has never had a
 * balance, which reads as 0. `getBalance` therefore returns 0 for a brand-new
 * member without writing anything. `adjustBalance` is the ledger-ready mutator
 * (top-ups, gift credits, spend) - it upserts the doc and never lets the
 * balance go negative. Amounts are agorot end-to-end; the wallet renders ILS.
 */
import type { Db } from 'mongodb';
import { getMongoDb } from '../../config/mongo';
import {
  WALLET_BALANCES_COLLECTION,
  type WalletBalance,
} from '../../models/payments/wallet-payments.models';

/** Client-facing balance view. */
export interface WalletBalanceView {
  balanceAgorot: number;
  currency: 'ILS';
}

function collection(db: Db) {
  return db.collection<WalletBalance>(WALLET_BALANCES_COLLECTION);
}

/**
 * Returns the caller's balance, defaulting to 0 when no doc exists yet
 * (lazy - no write on read).
 */
export async function getBalance(identityId: string): Promise<WalletBalanceView> {
  const db = await getMongoDb();
  const doc = await collection(db).findOne({ identityId }, { projection: { balanceAgorot: 1, currency: 1 } });
  return { balanceAgorot: doc?.balanceAgorot ?? 0, currency: 'ILS' };
}

/**
 * Adjust the balance by a signed agorot delta (upserts the doc). Clamps at 0
 * so spend can never drive it negative. Returns the resulting balance.
 *
 * @throws Error('insufficient_balance') when a negative delta exceeds the
 *         current balance.
 */
export async function adjustBalance(identityId: string, deltaAgorot: number): Promise<WalletBalanceView> {
  const db = await getMongoDb();
  const now = new Date();
  const current = (await collection(db).findOne({ identityId }, { projection: { balanceAgorot: 1 } }))?.balanceAgorot ?? 0;
  const next = current + deltaAgorot;
  if (next < 0) throw new Error('insufficient_balance');
  await collection(db).updateOne(
    { identityId },
    {
      $set: { balanceAgorot: next, currency: 'ILS', updatedAt: now },
      $setOnInsert: { identityId, createdAt: now },
    },
    { upsert: true },
  );
  return { balanceAgorot: next, currency: 'ILS' };
}
