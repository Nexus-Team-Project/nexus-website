/**
 * Verifies a Google Identity Services id_token issued for the wallet
 * domain (wallet.nexus-payment.com) and resolves it to a paired
 * (Prisma User, NexusIdentity) row set via resolveWalletIdentity.
 *
 * Re-uses the OAuth2Client that auth.service.ts already constructs from
 * GOOGLE_CLIENT_ID. The wallet hosts Google Identity Services itself,
 * so the same OAuth client works without any extra Google Cloud config
 * beyond adding wallet.nexus-payment.com as an authorized JS origin.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 3 and 6
 */
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { resolveWalletIdentity, type ResolvedWalletIdentity } from './wallet-identity.service';

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

/**
 * Verify a Google id_token and resolve the wallet identity.
 *
 * @throws google_token_invalid for any malformed, expired, or
 *   unverified-email token; the route maps this to HTTP 401.
 */
export async function handleGoogleWalletLogin(args: {
  idToken: string;
}): Promise<ResolvedWalletIdentity> {
  const ticket = await client.verifyIdToken({
    idToken: args.idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email || !payload.email_verified) {
    throw new Error('google_token_invalid');
  }
  return resolveWalletIdentity({
    email: payload.email,
    verifiedPhone: null,
    displayName: payload.name,
  });
}
