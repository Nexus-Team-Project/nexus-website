/**
 * Wallet magic-link lifecycle. startMagicLink generates a 256-bit token,
 * stores only its sha256 hash (15-min TTL), and emails the confirm-page link.
 * consumeMagicLink claims the token atomically (single-use) and returns the
 * verified email. Identity resolution + session issuance happen in the route,
 * mirroring the email-OTP verify route. The raw token is never logged.
 * Spec: docs/superpowers/specs/2026-07-16-wallet-email-magic-link-auth-design.md
 */
import { Db } from 'mongodb';
import { randomBytes } from 'crypto';
import { env } from '../../config/env';
import { hashToken } from '../../utils/crypto';
import { assertRateLimit } from './wallet-rate-limit';
import {
  WALLET_MAGIC_LINK_COLLECTION,
  type WalletMagicLink,
} from '../../models/auth/wallet-magic-link.models';
import { sendWalletMagicLinkMessage } from '../email/wallet-magic-link-email.service';

const TTL_MS = 15 * 60 * 1000;
const normalize = (e: string): string => e.trim().toLowerCase();

/** Result of startMagicLink. __testToken is only present under NODE_ENV=test. */
export interface StartMagicLinkResult {
  ok: true;
  __testToken?: string;
}

/**
 * Start a magic-link challenge: rate-limit per email, mint a token, store its
 * hash, and email the confirm-page link.
 *
 * @param args.email delivery target (verified by clicking the emailed link)
 * @param args.ip request IP (audit only)
 * @param args.lang email language, default 'he'
 * @throws Error('magic_unavailable') when WALLET_URL is not configured
 * @throws Error('rate_limited:<bucket>') when over the per-email cap
 */
export async function startMagicLink(
  db: Db,
  args: { email: string; ip: string; lang?: 'he' | 'en' },
): Promise<StartMagicLinkResult> {
  if (!env.WALLET_URL) throw new Error('magic_unavailable');
  const email = normalize(args.email);
  const lang = args.lang ?? 'he';
  await assertRateLimit(db, { bucket: 'magic_link_send', key: email, windowSec: 30, max: 1 });
  await assertRateLimit(db, { bucket: 'magic_link_send_hourly', key: email, windowSec: 3600, max: 5 });

  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const doc: WalletMagicLink = {
    tokenHash: hashToken(token),
    email,
    lang,
    createdAt: now,
    expiresAt: new Date(now.getTime() + TTL_MS),
    consumedAt: null,
    ip: args.ip || null,
  };
  await db.collection<WalletMagicLink>(WALLET_MAGIC_LINK_COLLECTION).insertOne(doc);

  const link = `${env.WALLET_URL}/${lang}/auth/magic?token=${token}`;
  await sendWalletMagicLinkMessage({ to: email, link, lang });

  if (process.env.NODE_ENV === 'test') return { ok: true, __testToken: token };
  return { ok: true };
}

/**
 * Consume a magic-link token: atomic single-use claim of an unexpired,
 * unconsumed row. Returns the verified email for identity resolution.
 *
 * @throws Error('link_invalid') for unknown, expired, or already-used tokens
 */
export async function consumeMagicLink(
  db: Db,
  args: { token: string },
): Promise<{ email: string }> {
  const tokenHash = hashToken(args.token);
  const now = new Date();
  const claimed = await db
    .collection<WalletMagicLink>(WALLET_MAGIC_LINK_COLLECTION)
    .findOneAndUpdate(
      { tokenHash, consumedAt: null, expiresAt: { $gt: now } },
      { $set: { consumedAt: now } },
      { returnDocument: 'after' },
    );
  if (!claimed) throw new Error('link_invalid');
  return { email: claimed.email };
}
