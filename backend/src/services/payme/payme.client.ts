/**
 * Low-level HTTP client for PayMe (payments provider). This is the ONLY file
 * in the codebase that knows PayMe URLs and payload shapes - all payment flows
 * (wallet voucher purchases, refunds) depend on this module's narrow contract,
 * never on PayMe wire formats directly. Swapping/upgrading the provider means
 * editing this file only.
 *
 * Environment: sandbox vs production is purely PAYME_BASE_URL + credentials
 * (see config/env.ts). Reference docs: docs/paymeDocs/ (workspace root).
 *
 * Conventions:
 * - All amounts are INTEGER AGOROT (PayMe convention: 50.75 ILS -> 5075;
 *   minimum sale price is 500 = 5.00 ILS).
 * - Requests are JSON POSTs; responses are Zod-validated before use.
 * - Errors are always PaymeError with a stable `code` - callers map codes to
 *   HTTP responses / localized messages; raw provider payloads never escape.
 * - SECURITY: buyer tokens (buyer_key) are never logged.
 */
import { z } from 'zod';
import { env } from '../../config/env';

/** Stable-coded error thrown by every operation in this module. */
export class PaymeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PaymeError';
  }
}

/**
 * Credentials are read at call time (process.env first, parsed env as
 * fallback) so tests can override without re-importing - same pattern as
 * sms/inforu.client.ts.
 */
function readCreds(): { base: string; clientKey: string; sellerId: string } {
  const base = process.env.PAYME_BASE_URL ?? env.PAYME_BASE_URL;
  const clientKey = process.env.PAYME_CLIENT_KEY ?? env.PAYME_CLIENT_KEY ?? '';
  const sellerId = process.env.PAYME_SELLER_ID ?? env.PAYME_SELLER_ID ?? '';
  return { base, clientKey, sellerId };
}

/** True when the PayMe integration has the env it needs to operate. */
export function isPaymeConfigured(): boolean {
  const { clientKey, sellerId } = readCreds();
  return Boolean(clientKey && sellerId);
}

/** Input for a server-to-server saved-card (token) charge. */
export interface PaymeChargeTokenInput {
  buyerKey: string;
  priceAgorot: number;
  currency: 'ILS';
  productName: string;
  /** OUR purchase id - PayMe echoes it back on the IPN callback as transaction_id. */
  transactionId: string;
  callbackUrl: string;
  installments: number;
  language: 'he' | 'en';
  buyerName?: string;
  buyerEmail?: string;
}

/** Normalized successful sale result. */
export interface PaymeSaleResult {
  paymeSaleId: string;
  paymeSaleCode: number | null;
  paymeTransactionId: string | null;
  saleStatus: string;
}

export interface PaymeRefundInput {
  paymeSaleId: string;
  /** Omit for a FULL refund; integer agorot (min 500) for partial. */
  refundAmountAgorot?: number;
}

/** Superset of the fields we consume from PayMe sale/refund responses. */
const paymeResponseSchema = z.object({
  status_code: z.number(),
  payme_sale_id: z.string().nullish(),
  payme_sale_code: z.number().nullish(),
  payme_transaction_id: z.string().nullish(),
  sale_status: z.string().nullish(),
  payme_sale_status: z.string().nullish(),
  status_error_code: z.number().nullish(),
  status_error_details: z.string().nullish(),
});
type PaymeResponse = z.infer<typeof paymeResponseSchema>;

/**
 * POST one PayMe API call and return the Zod-validated response.
 * @throws PaymeError payme_not_configured | payme_network_error | payme_http_<n> | payme_bad_response
 */
async function paymePost(path: string, body: Record<string, unknown>): Promise<PaymeResponse> {
  if (!isPaymeConfigured()) throw new PaymeError('payme_not_configured', 'PayMe env vars missing');
  const { base } = readCreds();
  const started = Date.now();

  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(
      `[payme] ${path} NETWORK FAIL (${Date.now() - started}ms): ${e instanceof Error ? e.message : String(e)}`,
    );
    throw new PaymeError('payme_network_error', 'PayMe request failed to send');
  }

  // PayMe returns errors as HTTP 500 with a JSON body carrying status_code 1,
  // so parse the body regardless of res.ok and let the caller branch on it.
  const raw: unknown = await res.json().catch(() => null);
  const parsed = paymeResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`[payme] ${path} HTTP ${res.status} unparseable body (${Date.now() - started}ms)`);
    throw new PaymeError('payme_bad_response', 'Unparseable PayMe response');
  }
  if (parsed.data.status_code !== 0) {
    console.error(
      `[payme] ${path} FAILED (${Date.now() - started}ms) error_code=${parsed.data.status_error_code ?? 'n/a'} details="${parsed.data.status_error_details ?? ''}"`,
    );
  } else {
    console.info(`[payme] ${path} OK (${Date.now() - started}ms) sale=${parsed.data.payme_sale_id ?? ''}`);
  }
  return parsed.data;
}

/**
 * Charge a saved card token (buyer_key) server-to-server via generate-sale.
 * No payment page is involved; the result is immediate. The IPN callback for
 * the same sale still arrives later and is used for reconciliation.
 *
 * @throws PaymeError charge_failed when PayMe rejects or the sale did not
 *         complete; plus the transport codes from paymePost.
 */
export async function paymeChargeToken(input: PaymeChargeTokenInput): Promise<PaymeSaleResult> {
  const { sellerId } = readCreds();
  const data = await paymePost('/generate-sale', {
    seller_payme_id: sellerId,
    sale_price: input.priceAgorot,
    currency: input.currency,
    product_name: input.productName,
    transaction_id: input.transactionId,
    installments: String(input.installments),
    sale_callback_url: input.callbackUrl,
    sale_payment_method: 'credit-card',
    language: input.language,
    // buyer_key must NEVER be sent together with capture_buyer (PayMe rule).
    buyer_key: input.buyerKey,
    ...(input.buyerName ? { buyer_name: input.buyerName } : {}),
    ...(input.buyerEmail ? { buyer_email: input.buyerEmail } : {}),
  });

  const saleStatus = data.sale_status ?? data.payme_sale_status ?? '';
  if (data.status_code !== 0 || !data.payme_sale_id || !['completed', 'authorized'].includes(saleStatus)) {
    throw new PaymeError('charge_failed', data.status_error_details ?? 'PayMe charge failed');
  }
  return {
    paymeSaleId: data.payme_sale_id,
    paymeSaleCode: data.payme_sale_code ?? null,
    paymeTransactionId: data.payme_transaction_id ?? null,
    saleStatus,
  };
}

/**
 * Refund a sale, fully (no amount) or partially (integer agorot).
 * @throws PaymeError refund_failed | transport codes.
 */
export async function paymeRefundSale(input: PaymeRefundInput): Promise<{ saleStatus: string }> {
  const { clientKey, sellerId } = readCreds();
  const data = await paymePost('/refund-sale', {
    payme_client_key: clientKey,
    seller_payme_id: sellerId,
    payme_sale_id: input.paymeSaleId,
    ...(input.refundAmountAgorot !== undefined ? { sale_refund_amount: input.refundAmountAgorot } : {}),
  });
  if (data.status_code !== 0) {
    throw new PaymeError('refund_failed', data.status_error_details ?? 'PayMe refund failed');
  }
  return { saleStatus: data.sale_status ?? 'refunded' };
}
