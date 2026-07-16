/**
 * Defines the Mongo-backed short-link document used by service outreach
 * (SMS/email invite links). One document per (tenantId, serviceKey); `code`
 * is the public base62 token resolved by GET /l/:code. Targets are written
 * only by our own services, never from user input.
 * Spec: docs/superpowers/specs/2026-07-15-members-service-invite-design.md s.3
 */
import type { Collection, Db } from 'mongodb';

/** Mongo collection name for self-hosted short links. */
export const SHORT_LINK_COLLECTION = 'shortLinks';

/** One self-hosted short link. */
export interface ShortLinkDocument {
  /** 6-8 char base62 crypto-random public token (unique index). */
  code: string;
  /** Absolute DB-sourced destination URL (e.g. WALLET_URL/?tenant=<id>). */
  targetUrl: string;
  tenantId: string;
  serviceKey: string;
  /** Best-effort redirect counter, bumped fire-and-forget. */
  clicks: number;
  createdAt: Date;
}

/**
 * Returns the typed shortLinks collection.
 * Input: open Mongo database handle. Output: typed collection accessor.
 */
export function getShortLinkCollection(db: Db): Collection<ShortLinkDocument> {
  return db.collection<ShortLinkDocument>(SHORT_LINK_COLLECTION);
}

/**
 * Creates idempotent indexes for short links.
 * Input: Mongo database handle.
 * Output: unique public code + unique one-link-per-(tenant, service).
 */
export async function ensureShortLinkIndexes(db: Db): Promise<void> {
  const col = getShortLinkCollection(db);
  await Promise.all([
    col.createIndex({ code: 1 }, { unique: true }),
    col.createIndex({ tenantId: 1, serviceKey: 1 }, { unique: true }),
  ]);
}
