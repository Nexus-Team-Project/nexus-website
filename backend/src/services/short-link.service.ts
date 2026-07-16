/**
 * Self-hosted short links for service outreach SMS/email.
 * getOrCreateShortLink is idempotent per (tenantId, serviceKey) and returns
 * an absolute URL under BACKEND_URL (/l/<code>). consumeShortLink resolves a
 * public code to its DB-sourced target and bumps the click counter without
 * delaying the redirect. No third-party shortener involved (decision 3).
 * Spec: docs/superpowers/specs/2026-07-15-members-service-invite-design.md s.3
 */
import { randomBytes } from 'crypto';
import { getMongoDb } from '../config/mongo';
import { env } from '../config/env';
import { getShortLinkCollection } from '../models/domain/short-links.models';
import { createError } from '../middleware/errorHandler';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CODE_LENGTH = 7;
const MAX_CODE_RETRIES = 5;
/** Accepts exactly the shapes we generate; everything else is a fast 404. */
const CODE_SHAPE = /^[0-9A-Za-z]{6,8}$/;

/**
 * Generates a crypto-random base62 code of CODE_LENGTH characters.
 * Input: none. Output: e.g. "aZ81xQ3".
 * ponytail: modulo bias over 62 symbols is fine here, the code only needs
 * uniqueness (enforced by index), not cryptographic uniformity.
 */
export function generateShortCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (const byte of bytes) code += BASE62[byte % BASE62.length];
  return code;
}

/**
 * True when a Mongo error is a duplicate-key (E11000) violation.
 * Input: unknown thrown value. Output: boolean.
 */
function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

/**
 * Returns the absolute short URL for (tenantId, serviceKey), creating the
 * link on first call. Idempotent: repeat calls return the same URL and never
 * overwrite an existing targetUrl. Race-safe via the unique
 * (tenantId, serviceKey) index; retries on the rare code collision.
 * Input: tenant id, service key, absolute destination URL.
 * Output: `${BACKEND_URL}/l/<code>`. Throws 500 when BACKEND_URL is unset.
 */
export async function getOrCreateShortLink(
  tenantId: string,
  serviceKey: string,
  targetUrl: string,
): Promise<string> {
  // Outside production a missing BACKEND_URL falls back to the local server
  // so dev outreach sends work out of the box; production must configure it
  // (a localhost link in a real SMS would be useless).
  const fallback = env.NODE_ENV !== 'production' ? `http://localhost:${env.PORT}` : undefined;
  const base = (env.BACKEND_URL ?? fallback)?.replace(/\/+$/, '');
  if (!base) throw createError('BACKEND_URL is not configured', 500);
  const col = getShortLinkCollection(await getMongoDb());

  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt += 1) {
    try {
      const doc = await col.findOneAndUpdate(
        { tenantId, serviceKey },
        {
          $setOnInsert: {
            code: generateShortCode(),
            targetUrl,
            tenantId,
            serviceKey,
            clicks: 0,
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      if (!doc) throw createError('Failed to create short link', 500);
      return `${base}/l/${doc.code}`;
    } catch (error) {
      // E11000 on the code index (collision) or on (tenantId, serviceKey)
      // (concurrent first call): retry - the next pass finds or re-rolls.
      if (isDuplicateKeyError(error) && attempt < MAX_CODE_RETRIES - 1) continue;
      throw error;
    }
  }
  throw createError('Failed to allocate a unique short-link code', 500);
}

/**
 * Resolves a short code to its stored target URL and bumps the click counter
 * fire-and-forget so the redirect is never delayed by the write.
 * Input: raw code from the URL path (untrusted).
 * Output: DB-sourced target URL, or null when the code is unknown/malformed.
 */
export async function consumeShortLink(code: string): Promise<string | null> {
  if (!CODE_SHAPE.test(code)) return null;
  const col = getShortLinkCollection(await getMongoDb());
  const doc = await col.findOne({ code });
  if (!doc) return null;
  void col.updateOne({ code }, { $inc: { clicks: 1 } }).catch(() => undefined);
  return doc.targetUrl;
}
