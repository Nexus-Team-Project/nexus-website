/**
 * Low-level HTTP client for InforU regular SMS send. This is the ONLY file
 * in the codebase that knows InforU URLs and payload shapes. The OTP code is
 * generated, hashed, and verified by US (see phone-otp.service); InforU only
 * delivers the SMS text we build. We do NOT use InforU's hosted OTP product.
 *
 * Spec: inforu-sms-api.md section 4 (POST /api/v2/SMS/SendSms).
 *
 * Notes:
 * - Auth is the HTTP `Authorization: Basic base64(user:token)` header.
 * - StatusId === 1 means success; anything else -> `inforu_send_status_<N>`.
 * - HTTP-level failures -> `inforu_http_<status>`; transport -> `inforu_network_error`.
 * - SECURITY: the message body contains the OTP code, so it is NEVER logged.
 */
import { createHash } from 'crypto';
import { env } from '../../config/env';

interface InforuResponse {
  StatusId: number;
  StatusDescription?: string;
  DetailDescription?: string | null;
  RequestToken?: string | null;
  FunctionName?: string;
}

/**
 * Short, non-reversible tag for a phone so logs can correlate calls for the same
 * number WITHOUT leaking it (never log raw phones or OTP codes). SHA-256 -> 10 hex.
 */
function phoneTag(phone: string): string {
  return createHash('sha256').update(phone).digest('hex').slice(0, 10);
}

/** Safely read a response body for logging; never throws, capped at 300 chars. */
async function readBodyForLog(res: { text?: () => Promise<string> }): Promise<string> {
  try {
    if (typeof res.text !== 'function') return '';
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}

/**
 * Reads creds and base URL from env at call time (not module load) so
 * tests can override them via process.env without re-importing.
 */
function readCreds(): { user: string; token: string; base: string; sender: string } {
  const user = process.env.INFORU_USER ?? env.INFORU_USER;
  const token = process.env.INFORU_TOKEN ?? env.INFORU_TOKEN;
  const base = process.env.INFORU_BASE_URL ?? env.INFORU_BASE_URL;
  // Sender ID shown to the recipient; must be approved by InforU for production.
  const sender = process.env.INFORU_SENDER ?? env.INFORU_SENDER ?? 'Nexus';
  if (!user || !token) throw new Error('inforu_not_configured');
  return { user, token, base, sender };
}

/**
 * Send one SMS via InforU's regular SMS API. The caller builds the full message
 * text (which includes the OTP code we generated). InforU only delivers it.
 *
 * SECURITY: `input.message` contains the OTP code and is therefore NEVER logged.
 *
 * @param input.phone canonical 05XXXXXXXX phone
 * @param input.message the SMS text to deliver
 * @throws inforu_not_configured | inforu_network_error | inforu_http_<n> | inforu_send_status_<n>
 */
export async function inforuSendSms(input: {
  phone: string;
  message: string;
}): Promise<void> {
  const { user, token, base, sender } = readCreds();
  const tag = phoneTag(input.phone);
  const started = Date.now();
  const auth = Buffer.from(`${user}:${token}`).toString('base64');
  const body = {
    Data: {
      Message: input.message,
      Recipients: [{ Phone: input.phone }],
      Settings: { Sender: sender },
    },
  };
  console.info(`[inforu] SendSms -> phone#${tag} sender=${sender} base=${base}`);

  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`${base}/api/v2/SMS/SendSms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(
      `[inforu] SendSms NETWORK FAIL phone#${tag} (${Date.now() - started}ms): ${e instanceof Error ? e.message : String(e)}`,
    );
    throw new Error('inforu_network_error');
  }

  if (!res.ok) {
    const detail = await readBodyForLog(res);
    console.error(
      `[inforu] SendSms HTTP ${res.status} phone#${tag} (${Date.now() - started}ms) body=${detail}`,
    );
    throw new Error(`inforu_http_${res.status}`);
  }

  const json = (await res.json()) as InforuResponse;
  if (json.StatusId !== 1) {
    console.error(
      `[inforu] SendSms FAILED phone#${tag} (${Date.now() - started}ms) StatusId=${json.StatusId} desc="${json.StatusDescription ?? ''}" detail="${json.DetailDescription ?? ''}"`,
    );
    throw new Error(`inforu_send_status_${json.StatusId}`);
  }

  console.info(`[inforu] SendSms OK phone#${tag} (${Date.now() - started}ms) StatusId=1`);
}
