/**
 * Utilities for identifying NEXUS platform admins from NEXUS_ADMIN_EMAILS env.
 * Platform admins can create and manage supply catalog without a tenant context.
 * Their offers always carry visibility = ecosystem and tenantId = 'nexus_platform'.
 *
 * Note: This module is distinct from config/platform-admins.ts which only handles
 * UI-gating role derivation (nexusAdmin PlatformRole). This util handles the
 * supply-layer admin fast-path: skipping tenant membership checks entirely.
 */
import { env } from '../config/env';

/** Cached set of admin emails, parsed once per process lifetime. */
let _adminEmails: Set<string> | null = null;

/**
 * Returns the set of platform admin emails from NEXUS_ADMIN_EMAILS env.
 * Parses once on first call and caches the result for the process lifetime.
 * Comparisons are case-insensitive (all entries are lowercased).
 * Input: none.
 * Output: Set of lowercase email strings.
 */
function getAdminEmailSet(): Set<string> {
  if (_adminEmails) return _adminEmails;
  const raw = env.NEXUS_ADMIN_EMAILS ?? '';
  _adminEmails = new Set(
    raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
  );
  return _adminEmails;
}

/**
 * Returns true if the given email belongs to a NEXUS platform admin.
 * Input: email string (any case).
 * Output: boolean - true when the email is listed in NEXUS_ADMIN_EMAILS.
 */
export function isPlatformAdminEmail(email: string): boolean {
  return getAdminEmailSet().has(email.toLowerCase());
}

/**
 * Sentinel tenantId written to offers created by the NEXUS platform team.
 * Used in supply.service and catalog.service to distinguish platform-origin offers
 * from tenant-origin offers. Never a real MongoDB ObjectId.
 */
export const NEXUS_PLATFORM_TENANT_ID = 'nexus_platform';
