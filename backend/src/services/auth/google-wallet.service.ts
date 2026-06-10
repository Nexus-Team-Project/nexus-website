/**
 * Verifies a Google login (either Identity Services id_token OR OAuth2
 * authorization-code from the full-page redirect flow) and resolves it
 * to a paired (Prisma User, NexusIdentity) row set via
 * resolveWalletIdentity.
 *
 * Two entry points:
 * - handleGoogleWalletLogin({ idToken })          - GIS / popup flow
 * - handleGoogleWalletCode({ code, redirectUri })  - redirect flow
 *
 * Both end in the same resolveWalletIdentity call.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 3 and 6
 */
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { resolveWalletIdentity, type ResolvedWalletIdentity } from './wallet-identity.service';

const idTokenVerifier = new OAuth2Client(env.GOOGLE_CLIENT_ID);

interface VerifiedPayload {
  email: string;
  name?: string;
  /** Google profile photo URL from the id_token `picture` claim, if present. */
  picture?: string;
}

/**
 * Verifies a Google id_token against the configured client id and
 * returns the trusted payload subset we use to resolve the identity.
 *
 * @throws google_token_invalid for any malformed, expired, or
 *   unverified-email token
 */
async function verifyIdToken(idToken: string): Promise<VerifiedPayload> {
  const ticket = await idTokenVerifier.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email || !payload.email_verified) {
    throw new Error('google_token_invalid');
  }
  return { email: payload.email, name: payload.name, picture: payload.picture };
}

/**
 * Best-effort fetch of the user's Google profile photo from the OpenID
 * userinfo endpoint. The id_token sometimes omits the `picture` claim even
 * when the account has a photo, so the code flow (which has an access token)
 * falls back to this. Never throws - returns null on any failure.
 *
 * @param accessToken Google OAuth access token with the `profile` scope.
 * @returns the photo URL, or null when absent/unavailable.
 */
async function fetchGooglePicture(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { picture?: string };
    return data.picture ?? null;
  } catch {
    return null;
  }
}

/**
 * GIS / popup flow entry point. Verifies the id_token and resolves the
 * wallet identity.
 */
export async function handleGoogleWalletLogin(args: {
  idToken: string;
}): Promise<ResolvedWalletIdentity> {
  const payload = await verifyIdToken(args.idToken);
  return resolveWalletIdentity({
    email: payload.email,
    verifiedPhone: null,
    displayName: payload.name,
    avatarUrl: payload.picture ?? null,
  });
}

/**
 * Full-page redirect flow entry point. Exchanges the authorization
 * code returned by Google for an id_token (using the same redirect_uri
 * the browser sent to Google), then resolves the wallet identity.
 *
 * The redirectUri MUST match exactly what the wallet sent to Google
 * and MUST be configured in Google Cloud Console as an authorized
 * redirect URI for this client id.
 *
 * @throws google_not_configured if GOOGLE_CLIENT_SECRET is missing
 * @throws google_token_invalid if Google did not return an id_token
 */
export async function handleGoogleWalletCode(args: {
  code: string;
  redirectUri: string;
}): Promise<ResolvedWalletIdentity> {
  if (!env.GOOGLE_CLIENT_SECRET) throw new Error('google_not_configured');
  const codeClient = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    args.redirectUri,
  );
  const { tokens } = await codeClient.getToken(args.code);
  if (!tokens.id_token) throw new Error('google_token_invalid');
  const payload = await verifyIdToken(tokens.id_token);
  // The id_token often omits `picture`; the code flow has an access token, so
  // fall back to the userinfo endpoint to reliably capture the profile photo.
  let avatarUrl = payload.picture ?? null;
  if (!avatarUrl && tokens.access_token) {
    avatarUrl = await fetchGooglePicture(tokens.access_token);
  }
  return resolveWalletIdentity({
    email: payload.email,
    verifiedPhone: null,
    displayName: payload.name,
    avatarUrl,
  });
}
