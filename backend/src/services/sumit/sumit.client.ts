/**
 * Low-level HTTP client for SUMIT / OfficeGuy (receipts + accounting docs).
 * This is the ONLY file in the codebase that knows SUMIT URLs and payload
 * shapes - receipt issuing depends on this module's narrow contract only.
 *
 * API: https://api.sumit.co.il (swagger: app.sumit.co.il/help/developers).
 * Auth is body-level `Credentials: { CompanyID, APIKey }` on every call.
 *
 * SAFETY: outside production every document is created with IsDraft: true,
 * so dev/test runs never write real numbered documents into the company's
 * books (the SUMIT company is the real Nexus Consumer LTD account).
 *
 * Amount convention: SUMIT uses DECIMAL SHEKELS (unlike PayMe's agorot);
 * callers convert at this boundary (priceShekels).
 */
import { z } from 'zod';
import { env } from '../../config/env';

/** Stable-coded error thrown by every operation in this module. */
export class SumitError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SumitError';
  }
}

const SUMIT_BASE_URL = 'https://api.sumit.co.il';

/** Creds read at call time (process.env first) so tests can override. */
function readCreds(): { companyId: number; apiKey: string; documentType: number } {
  const companyId = Number(process.env.SUMIT_COMPANY_ID ?? env.SUMIT_COMPANY_ID ?? 0);
  const apiKey = process.env.SUMIT_API_KEY ?? env.SUMIT_API_KEY ?? '';
  const documentType = Number(process.env.SUMIT_DOCUMENT_TYPE ?? env.SUMIT_DOCUMENT_TYPE ?? 1);
  return { companyId, apiKey, documentType };
}

/** True when the SUMIT integration has the env it needs to operate. */
export function isSumitConfigured(): boolean {
  const { companyId, apiKey } = readCreds();
  return Boolean(companyId && apiKey);
}

/** Input for issuing one purchase receipt. */
export interface SumitReceiptInput {
  customerName: string;
  customerEmail: string;
  itemName: string;
  /** Per-unit price in decimal shekels (e.g. 90 or 90.5) - NOT agorot. */
  priceShekels: number;
  /** Units bought; the document total is priceShekels * quantity. Default 1. */
  quantity?: number;
  cardLast4?: string;
  language: 'he' | 'en';
  /** Our purchaseId - stored on the document for correlation. */
  externalReference: string;
}

const createResponseSchema = z.object({
  Status: z.number(),
  UserErrorMessage: z.string().nullish(),
  Data: z
    .object({
      DocumentID: z.number(),
      DocumentNumber: z.number().nullish(),
      DocumentDownloadURL: z.string().nullish(),
    })
    .nullish(),
});

/**
 * Create a receipt document (type from SUMIT_DOCUMENT_TYPE, default
 * InvoiceAndReceipt) and have SUMIT email it to the buyer. Draft outside
 * production.
 *
 * @throws SumitError sumit_not_configured | sumit_network_error | sumit_bad_response | sumit_error
 */
export async function sumitCreateReceipt(
  input: SumitReceiptInput,
): Promise<{ documentId: number; documentNumber: number | null }> {
  const { companyId, apiKey, documentType } = readCreds();
  if (!isSumitConfigured()) throw new SumitError('sumit_not_configured', 'SUMIT env vars missing');

  const quantity = input.quantity ?? 1;
  const total = input.priceShekels * quantity;
  const body = {
    Credentials: { CompanyID: companyId, APIKey: apiKey },
    Details: {
      // Drafts outside production - never real numbered documents in dev.
      IsDraft: process.env.NODE_ENV !== 'production',
      Type: documentType,
      Language: input.language === 'he' ? 'Hebrew' : 'English',
      Currency: 'ILS',
      ExternalReference: input.externalReference,
      Customer: {
        Name: input.customerName,
        EmailAddress: input.customerEmail,
        SearchMode: 0,
      },
      SendByEmail: {
        EmailAddress: input.customerEmail,
        Original: true,
        SendAsPaymentRequest: false,
      },
    },
    Items: [
      {
        Quantity: quantity,
        UnitPrice: input.priceShekels,
        TotalPrice: total,
        Item: { Name: input.itemName, SearchMode: 0 },
      },
    ],
    Payments: [
      {
        Amount: total,
        ...(input.cardLast4 ? { Details_CreditCard: { Last4Digits: input.cardLast4 } } : {}),
      },
    ],
    VATIncluded: true,
  };

  const started = Date.now();
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`${SUMIT_BASE_URL}/accounting/documents/create/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(
      `[sumit] documents/create NETWORK FAIL (${Date.now() - started}ms): ${e instanceof Error ? e.message : String(e)}`,
    );
    throw new SumitError('sumit_network_error', 'SUMIT request failed to send');
  }

  const parsed = createResponseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    console.error(`[sumit] documents/create HTTP ${res.status} unparseable body (${Date.now() - started}ms)`);
    throw new SumitError('sumit_bad_response', 'Unparseable SUMIT response');
  }
  if (parsed.data.Status !== 0 || !parsed.data.Data) {
    console.error(
      `[sumit] documents/create FAILED (${Date.now() - started}ms) msg="${parsed.data.UserErrorMessage ?? ''}"`,
    );
    throw new SumitError('sumit_error', parsed.data.UserErrorMessage ?? 'SUMIT document creation failed');
  }
  console.info(
    `[sumit] documents/create OK (${Date.now() - started}ms) doc=${parsed.data.Data.DocumentID} draft=${process.env.NODE_ENV !== 'production'}`,
  );
  return {
    documentId: parsed.data.Data.DocumentID,
    documentNumber: parsed.data.Data.DocumentNumber ?? null,
  };
}

/**
 * Fetch a document's PDF bytes by SUMIT DocumentID. `Original: false` fetches
 * a certified copy so the buyer can re-view without consuming the original.
 *
 * @throws SumitError sumit_not_configured | sumit_network_error | sumit_error
 */
export async function sumitGetDocumentPdf(documentId: number): Promise<Buffer> {
  const { companyId, apiKey } = readCreds();
  if (!isSumitConfigured()) throw new SumitError('sumit_not_configured', 'SUMIT env vars missing');

  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`${SUMIT_BASE_URL}/accounting/documents/getpdf/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Credentials: { CompanyID: companyId, APIKey: apiKey },
        DocumentID: documentId,
        Original: false,
      }),
    });
  } catch (e) {
    console.error(`[sumit] documents/getpdf NETWORK FAIL: ${e instanceof Error ? e.message : String(e)}`);
    throw new SumitError('sumit_network_error', 'SUMIT request failed to send');
  }
  if (!res.ok) throw new SumitError('sumit_error', `SUMIT getpdf HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
