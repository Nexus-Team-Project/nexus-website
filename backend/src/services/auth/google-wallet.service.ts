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
  return { email: payload.email, name: payload.name };
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
  return resolveWalletIdentity({
    email: payload.email,
    verifiedPhone: null,
    displayName: payload.name,
  });
}
