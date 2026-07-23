/**
 * Purchase-side voucher inventory + collection helpers, shared by the
 * purchase flow and the IPN callback handler (purchase.service.ts):
 * typed collection accessors, atomic unit claiming (available->assigned),
 * release-on-failure, and the failed-status marker.
 *
 * Claiming also FILLS a "limit"-type unit's redeemable window: a unit that
 * carries a duration recipe (validityValue/validityUnit) but no window gets
 * validFrom = now and validUntil = now + duration stamped at claim time
 * (marked with validityFilledAt so release can tell a stamped window from an
 * admin-authored one). This is the purchase-time fill the unit-level dating
 * change deferred - it makes the expiry date real for the buyer's wallet AND
 * the admin inventory view.
 */
import type { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import { addValidityDuration } from '../../models/domain/voucher-codes.models';
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

/**
 * Return every unit claimed by a purchase back to the available pool.
 * Purchase-stamped validity windows (validityFilledAt set) are cleared first
 * so the next buyer gets a fresh window computed from THEIR purchase date;
 * admin-authored from_until windows are never touched.
 */
export async function releaseUnitsForPurchase(db: Db, purchaseId: string): Promise<void> {
  await voucherUnits(db).updateMany(
    { assignedPurchaseId: purchaseId, validityFilledAt: { $exists: true, $ne: null } },
    { $unset: { validFrom: '', validUntil: '', validityFilledAt: '' } },
  );
  await voucherUnits(db).updateMany(
    { assignedPurchaseId: purchaseId },
    { $set: { status: 'available', updatedAt: new Date() }, $unset: { assignedPurchaseId: '' } },
  );
}

/**
 * Fills a claimed "limit"-type unit's redeemable window from its duration
 * recipe (anchor = the claim moment). No-op for units that already carry a
 * window (admin-authored from_until, or an anomalous double claim) or carry
 * no recipe. Mutates + persists; returns the unit for chaining.
 */
async function fillLimitWindow(db: Db, unit: VoucherUnitDoc, now: Date): Promise<VoucherUnitDoc> {
  if (unit.validUntil || !unit.validityValue || !unit.validityUnit) return unit;
  const validUntil = addValidityDuration(now, unit.validityValue, unit.validityUnit);
  await voucherUnits(db).updateOne(
    { codeId: unit.codeId },
    { $set: { validFrom: now, validUntil, validityFilledAt: now, updatedAt: now } },
  );
  unit.validFrom = now;
  unit.validUntil = validUntil;
  unit.validityFilledAt = now;
  return unit;
}

/**
 * Atomically claim `quantity` available units of a variant for a purchase.
 * Each claimed limit-type unit gets its real validity window stamped (see
 * fillLimitWindow). Returns the claimed unit docs, or null when fewer than
 * `quantity` are available (any partially-claimed units are released before
 * returning).
 */
export async function claimUnits(
  db: Db,
  args: { offerId: string; variantId: string; purchaseId: string; quantity: number },
): Promise<VoucherUnitDoc[] | null> {
  const claimed: VoucherUnitDoc[] = [];
  const now = new Date();
  for (let i = 0; i < args.quantity; i += 1) {
    const unit = await voucherUnits(db).findOneAndUpdate(
      { offerId: args.offerId, variantId: args.variantId, status: 'available' },
      { $set: { status: 'assigned', assignedPurchaseId: args.purchaseId, updatedAt: now } },
      { returnDocument: 'after' },
    );
    if (!unit) {
      await releaseUnitsForPurchase(db, args.purchaseId);
      return null;
    }
    claimed.push(await fillLimitWindow(db, unit, now));
  }
  return claimed;
}
