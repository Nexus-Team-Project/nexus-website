/**
 * Purchase-side voucher inventory + collection helpers, shared by the
 * purchase flow and the IPN callback handler (purchase.service.ts):
 * typed collection accessors, atomic unit claiming (available->assigned),
 * release-on-failure, and the failed-status marker.
 */
import type { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import {
  WALLET_PURCHASES_COLLECTION,
  type WalletPurchase,
} from '../../models/payments/wallet-payments.models';
import type { VoucherUnitDoc } from './purchase-view.helper';

/** Typed walletPurchases collection accessor. */
export function purchases(db: Db) {
  return db.collection<WalletPurchase>(WALLET_PURCHASES_COLLECTION);
}

/** Typed voucherCodes collection accessor. */
export function voucherUnits(db: Db) {
  return db.collection<VoucherUnitDoc>(DOMAIN_COLLECTIONS.voucherCodes);
}

/** Marks a purchase attempt failed (allowance + retry stay open). */
export async function markFailed(db: Db, purchaseId: string): Promise<void> {
  await purchases(db).updateOne({ purchaseId }, { $set: { status: 'failed' } });
}

/** Return every unit claimed by a purchase back to the available pool. */
export async function releaseUnitsForPurchase(db: Db, purchaseId: string): Promise<void> {
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
export async function claimUnits(
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
