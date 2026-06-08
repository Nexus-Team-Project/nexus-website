/**
 * Browser-side client for the public contact-sales endpoint.
 *
 * Kept intentionally small and self-contained so it can be imported by the
 * ContactSalesModal without pulling the auth-aware api.ts client (the form
 * is unauthenticated).
 */

const API_URL = import.meta.env.VITE_API_URL || '';

/** Shape of the payload sent to /api/v1/contact-sales. */
export interface ContactSalesRequest {
  email: string;
  phone?: string;
  name?: string;
  message: string;
  language: 'en' | 'he';
  page?: string;
}

/** Shape of the error returned to the form when submission fails. */
export interface ContactSalesError {
  /** Localised, user-safe message. */
  message: string;
  /** True when the server returned 429 so the UI can offer a "try again later" hint. */
  rateLimited?: boolean;
  /** True when the server returned a validation failure so the UI can re-focus a field. */
  validation?: boolean;
}

/**
 * Submit the contact-sales form to the backend.
 *
 * Inputs: a {@link ContactSalesRequest} object built by the modal.
 * Output: resolves on 2xx, rejects with a {@link ContactSalesError} otherwise.
 */
export async function submitContactSales(body: ContactSalesRequest): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/contact-sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw { message: 'network' } satisfies ContactSalesError;
  }

  if (response.ok) return;

  if (response.status === 429) {
    throw { message: 'rate_limited', rateLimited: true } satisfies ContactSalesError;
  }

  if (response.status === 422 || response.status === 400) {
    throw { message: 'validation', validation: true } satisfies ContactSalesError;
  }

  throw { message: 'server' } satisfies ContactSalesError;
}
