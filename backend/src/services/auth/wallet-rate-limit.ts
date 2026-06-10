/**
 * Mongo-backed sliding-window rate limiter for wallet auth endpoints.
 * Single source of truth: no in-memory state, safe across processes
 * and across backend restarts. Each call counts how many events for
 * (bucket, key) fell within the last windowSec seconds; throws when
 * the count meets or exceeds max, otherwise inserts a marker row and
 * returns.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 10.6
 */
import { Db } from 'mongodb';

const COLLECTION = 'walletRateLimits';

/**
 * Per-call rate-limit configuration.
 *
 * @param bucket logical group (e.g. 'phone_otp_send', 'email_otp_send')
 * @param key the identifier this limit applies to (phone, email, or IP)
 * @param windowSec sliding-window length in seconds
 * @param max maximum events allowed in the window before throwing
 */
export interface RateLimitParams {
  bucket: string;
  key: string;
  windowSec: number;
  max: number;
}

interface RateLimitRow {
  bucket: string;
  key: string;
  createdAt: Date;
}

/**
 * Throws Error('rate_limited:<bucket>') when the (bucket, key) pair
 * has reached `max` events inside the last `windowSec` seconds.
 * Otherwise records a marker and returns. The TTL index is created
 * once per process; subsequent calls are no-ops.
 *
 * @throws Error with message starting 'rate_limited:' when over the cap
 */
export async function assertRateLimit(db: Db, p: RateLimitParams): Promise<void> {
  const col = db.collection<RateLimitRow>(COLLECTION);
  await col.createIndex(
    { createdAt: 1 },
    { name: 'createdAt_ttl', expireAfterSeconds: 24 * 3600 },
  );
  const since = new Date(Date.now() - p.windowSec * 1000);
  const count = await col.countDocuments({
    bucket: p.bucket,
    key: p.key,
    createdAt: { $gte: since },
  });
  if (count >= p.max) throw new Error(`rate_limited:${p.bucket}`);
  await col.insertOne({ bucket: p.bucket, key: p.key, createdAt: new Date() });
}
