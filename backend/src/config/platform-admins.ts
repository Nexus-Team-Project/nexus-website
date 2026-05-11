/**
 * Reads backend-only platform admin settings used for internal Nexus access.
 * The email allow-list stays in environment variables and is never sent raw to clients.
 */
import { env } from './env';

export type PlatformRole = 'nexusAdmin';

const PLATFORM_ADMIN_ROLE: PlatformRole = 'nexusAdmin';

/**
 * Normalizes email addresses before comparison.
 * Input: email from trusted auth data or backend configuration.
 * Output: lowercase email without surrounding spaces.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Parses the comma-separated backend allow-list into normalized emails.
 * Input: `NEXUS_ADMIN_EMAILS` from the backend environment.
 * Output: normalized email strings with empty entries removed.
 */
function getConfiguredAdminEmails(): string[] {
  return (env.NEXUS_ADMIN_EMAILS ?? '')
    .split(',')
    .map(normalizeEmail)
    .filter((email) => email.length > 0);
}

/**
 * Derives the Nexus platform role from trusted backend identity data.
 * Input: authenticated Prisma user email.
 * Output: `nexusAdmin` when the email is configured as a platform admin, otherwise null.
 */
export function getPlatformRoleForEmail(email: string): PlatformRole | null {
  const normalizedEmail = normalizeEmail(email);
  return getConfiguredAdminEmails().includes(normalizedEmail) ? PLATFORM_ADMIN_ROLE : null;
}
