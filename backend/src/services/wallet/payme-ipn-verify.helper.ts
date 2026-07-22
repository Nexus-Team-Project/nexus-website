/**
 * Server-to-server verification of PayMe IPN callbacks.
 *
 * The IPN payload is untrusted network input (PayMe's `payme_signature`
 * formula is account-specific and was not provided with our credentials), so
 * before the callback handler acts it asks PayMe directly - `paymeGetSale`,
 * authenticated by our client key - whether the sale really exists in the
 * state the callback claims. This is strictly stronger than validating an
 * MD5 signature: a forged or replayed callback cannot fabricate PayMe's own
 * authenticated answer.
 *
 * Verdicts:
 * - 'confirmed'   -> PayMe's records support the callback; act on it.
 * - 'mismatch'    -> PayMe's records CONTRADICT the callback (unknown sale,
 *                    wrong amount, wrong state). Ignore it in EVERY
 *                    environment - this is the forgery signal.
 * - 'unavailable' -> verification could not run (network error, PayMe env not
 *                    configured). The caller fails CLOSED in production and
 *                    OPEN elsewhere, so sandbox/test flows (and the vitest
 *                    suite, which runs without PayMe env) keep working.
 */
import { paymeGetSale } from '../payme/payme.client';

export type IpnVerification = 'confirmed' | 'mismatch' | 'unavailable';

/** The notify types the callback handler acts on - anything else is a no-op. */
export const VERIFIED_NOTIFY_TYPES = ['sale-complete', 'sale-failure', 'refund'] as const;
export type VerifiedNotifyType = (typeof VERIFIED_NOTIFY_TYPES)[number];

/**
 * Verify one IPN callback against PayMe's get-sales records.
 * Input: the callback's notify type, its payme_sale_id, and the exact total
 * (integer agorot) the matched purchase expects.
 * Output: a verdict - never throws.
 */
export async function verifyIpnAgainstPayme(args: {
  notifyType: VerifiedNotifyType;
  paymeSaleId: string;
  expectedPriceAgorot: number;
}): Promise<IpnVerification> {
  let sale: Awaited<ReturnType<typeof paymeGetSale>>;
  try {
    sale = await paymeGetSale(args.paymeSaleId);
  } catch (e) {
    console.warn(
      `[payme-ipn-verify] get-sales unavailable for ${args.paymeSaleId}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return 'unavailable';
  }

  const verdict = ((): IpnVerification => {
    switch (args.notifyType) {
      case 'sale-complete':
        // Fulfillment: the sale must exist, be actually paid/authorized, and
        // carry the exact amount our purchase expects.
        return sale &&
          ['completed', 'authorized'].includes(sale.saleStatus) &&
          sale.priceAgorot === args.expectedPriceAgorot
          ? 'confirmed'
          : 'mismatch';
      case 'refund':
        // Status flip on a completed purchase: PayMe must agree it was refunded.
        return sale &&
          ['refunded', 'partial-refund'].includes(sale.saleStatus) &&
          sale.priceAgorot === args.expectedPriceAgorot
          ? 'confirmed'
          : 'mismatch';
      case 'sale-failure':
        // Releases claimed voucher units. The forgery to block is a fake
        // failure for a sale PayMe actually charged - so reject only when
        // PayMe shows the sale as paid/authorized. A missing sale (nothing
        // ever charged) or any failed/canceled state confirms the failure.
        return sale && ['completed', 'authorized'].includes(sale.saleStatus) ? 'mismatch' : 'confirmed';
    }
  })();

  console.info(
    `[payme-ipn-verify] sale=${args.paymeSaleId} notify=${args.notifyType} payme_status=${sale?.saleStatus ?? 'not_found'} payme_price=${sale?.priceAgorot ?? 'n/a'} expected=${args.expectedPriceAgorot} -> ${verdict.toUpperCase()}`,
  );
  return verdict;
}
