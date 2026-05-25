/**
 * Low-level HTTP client for InforU hosted OTP. This is the ONLY file
 * in the codebase that knows InforU URLs and payload shapes. Higher-
 * level code calls inforuSendOtp / inforuAuthenticateOtp.
 *
 * Spec: inforu-sms-api.md sections 2 and 3.
 *
 * Notes:
 * - Credentials sit inside the JSON body (User.UserName + User.Token).
 *   InforU OTP endpoints do not use an Authorization header.
 * - StatusId === 1 means success. Anything else is mapped to an Error
 *   with code `inforu_send_status_<N>` or `inforu_auth_status_<N>`.
 * - HTTP-level failures are mapped to `inforu_http_<status>`.
 */
import { env } from '../../config/env';

interface InforuResponse {
  StatusId: number;
  StatusDescription?: string;
  DetailDescription?: string | null;
  RequestToken?: string | null;
  FunctionName?: string;
}

/**
 * Reads creds and base URL from env at call time (not module load) so
 * tests can override them via process.env without re-importing.
 */
function readCreds(): { user: string; token: string; base: string } {
  const user = process.env.INFORU_USER ?? env.INFORU_USER;
  const token = process.env.INFORU_TOKEN ?? env.INFORU_TOKEN;
  const base = process.env.INFORU_BASE_URL ?? env.INFORU_BASE_URL;
  if (!user || !token) throw new Error('inforu_not_configured');
  return { user, token, base };
}

/**
 * Trigger InforU to send a 6-digit OTP by SMS. InforU stores and
 * verifies the code itself; we only persist the RequestToken returned
 * here so we can pair it with the subsequent Authenticate call.
 *
 * @param input.phone canonical 05XXXXXXXX phone
 * @param input.userIp end-user IP, recommended by InforU for abuse signals
 * @returns the RequestToken to store on our local challenge row
 */
export async function inforuSendOtp(input: {
  phone: string;
  userIp?: string;
}): Promise<{ requestToken: string }> {
  const { user, token, base } = readCreds();
  const body = {
    User: { UserName: user, Token: token },
    Data: {
      OtpType: 'sms',
      OtpValue: input.phone,
      ...(input.userIp ? { UserIP: input.userIp } : {}),
    },
  };
  const res = await fetch(`${base}/api/Otp/SendOtp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`inforu_http_${res.status}`);
  const json = (await res.json()) as InforuResponse;
  if (json.StatusId !== 1 || !json.RequestToken) {
    throw new Error(`inforu_send_status_${json.StatusId}`);
  }
  return { requestToken: json.RequestToken };
}

/**
 * Verify a code the user entered against the InforU RequestToken we
 * stored at SendOtp time. Returns ok=true only on StatusId=1; all other
 * statuses (wrong code, expired, locked) collapse to ok=false so the
 * caller can map them to a single generic `otp_invalid` for the client.
 *
 * @param input.phone canonical 05XXXXXXXX phone (same as in SendOtp)
 * @param input.code 6-digit code the user entered
 * @param input.requestToken token returned by SendOtp
 */
export async function inforuAuthenticateOtp(input: {
  phone: string;
  code: string;
  requestToken: string;
}): Promise<{ ok: boolean }> {
  const { user, token, base } = readCreds();
  const body = {
    User: { UserName: user, Token: token },
    Data: {
      OtpCode: input.code,
      OtpValue: input.phone,
      RequestToken: input.requestToken,
    },
  };
  const res = await fetch(`${base}/api/Otp/Authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`inforu_http_${res.status}`);
  const json = (await res.json()) as InforuResponse;
  return { ok: json.StatusId === 1 };
}
