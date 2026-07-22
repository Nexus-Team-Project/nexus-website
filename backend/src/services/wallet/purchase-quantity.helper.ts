/**
 * Per-customer purchase quantity cap.
 *
 * Business rule: a customer may hold at most PURCHASE_MAX_QUANTITY units of
 * one voucher variant, CUMULATIVE across all their pending+completed
 * purchases of that variant (refunded/failed purchases free the allowance).
 * The single-purchase quantity bound uses the same constant, so one maxed
 * purchase and five single-unit purchases hit the identical ceiling.
 *
 * Enforcement is insert-then-recount: the caller inserts its pending purchase
 * doc FIRST, then calls this assert - so two concurrent purchases each see
 * the other's pending doc in the recount and cannot jointly exceed the cap
 * (no unique index needed to close the race; at worst both abort and the
 * customer retries).
 */
import type { Db } from 'mongodb';
import {
  PURCHASE_MAX_QUANTITY,
  WALLET_PURCHASES_COLLECTION,
  type WalletPurchase,
} from '../../models/payments/wallet-payments.models';

/**
 * Asserts the customer's cumulative held quantity for a variant (including
 * the just-inserted pending purchase) is within PURCHASE_MAX_QUANTITY.
 * On violation the new purchase is marked failed (nothing was charged or
 * claimed yet) and Error('quantity_limit') is thrown for the route to map.
 */
export async function assertCustomerVariantCap(
  db: Db,
  args: { identityId: string; offerId: string; variantId: string; purchaseId: string; quantity: number },
): Promise<void> {
  const purchases = db.collection<WalletPurchase>(WALLET_PURCHASES_COLLECTION);
  const [heldRow] = await purchases
    .aggregate<{ total: number }>([
      {
        $match: {
          identityId: args.identityId,
          offerId: args.offerId,
          variantId: args.variantId,
          status: { $in: ['pending', 'completed'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ])
    .toArray();
  const held = heldRow?.total ?? args.quantity;
  if (held <= PURCHASE_MAX_QUANTITY) return;

  console.warn(
    `[wallet-purchase] ${args.purchaseId} QUANTITY LIMIT: customer would hold ${held} > ${PURCHASE_MAX_QUANTITY} units of variant ${args.variantId} - marked failed, nothing charged`,
  );
  await purchases.updateOne({ purchaseId: args.purchaseId }, { $set: { status: 'failed' } });
  throw new Error('quantity_limit');
}
