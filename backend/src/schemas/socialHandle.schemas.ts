/**
 * Validation for tenant social-media handles (Instagram/Facebook/X).
 *
 * A tenant never supplies a domain - only a handle. This is a structural
 * safety property, not a blocklist: the stored value is always JUST the
 * handle, and the public profile URL shown to members is always built from
 * OUR hardcoded per-platform domain + that handle. A tenant can never get an
 * arbitrary/malicious link stored under an "Instagram" label.
 *
 * Input is forgiving: a tenant may paste a full profile URL
 * (`https://instagram.com/nexuspay`), an `@handle`, or a bare handle - all
 * three reduce to the same stored value via `extractHandleCandidate`.
 */
import { z } from 'zod';

export type SocialPlatform = 'instagram' | 'facebook' | 'twitter';

/** Real per-platform handle character rules + the domain used to build the public URL. */
const HANDLE_RULES: Record<SocialPlatform, { pattern: RegExp; domain: string }> = {
  instagram: { pattern: /^[A-Za-z0-9_.]{1,30}$/, domain: 'instagram.com' },
  facebook: { pattern: /^[A-Za-z0-9.]{5,50}$/, domain: 'facebook.com' },
  twitter: { pattern: /^[A-Za-z0-9_]{1,15}$/, domain: 'x.com' },
};

/**
 * Reduce a pasted URL, an `@handle`, or a bare handle down to a candidate
 * handle string. Does NOT validate the result - callers must still check it
 * against `isValidSocialHandle`.
 * Input: raw user-typed/pasted value.
 * Output: the trimmed candidate handle (may still be invalid/empty).
 */
export function extractHandleCandidate(input: string): string {
  const trimmed = input.trim().replace(/^@/, '');
  if (!trimmed.includes('/')) return trimmed;
  const withoutQuery = trimmed.split(/[?#]/)[0] ?? '';
  const segments = withoutQuery.split('/').filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? '';
}

/**
 * Whether a candidate handle matches the given platform's real character
 * and length rules.
 * Input: the platform + a candidate handle (already run through
 * `extractHandleCandidate`).
 * Output: true when the handle is well-formed for that platform.
 */
export function isValidSocialHandle(platform: SocialPlatform, handle: string): boolean {
  return HANDLE_RULES[platform].pattern.test(handle);
}

/**
 * Build the canonical public profile URL for a validated handle. Always uses
 * OUR hardcoded domain - never anything derived from user input.
 * Input: the platform + a validated handle.
 * Output: the full `https://` profile URL.
 */
export function buildSocialUrl(platform: SocialPlatform, handle: string): string {
  return `https://${HANDLE_RULES[platform].domain}/${handle}`;
}

/**
 * A social-handle body field, resolving to one of three distinct states the
 * service layer needs to tell apart:
 * - `undefined` - the key was absent from the request body -> leave the
 *   stored field unchanged.
 * - `null` - the key was `null` or an empty/whitespace-only string -> clear
 *   the stored field.
 * - a string - reduced to a bare, validated handle -> set the stored field.
 */
function socialHandleField(platform: SocialPlatform) {
  return z
    .string()
    .nullable()
    .optional()
    .refine(
      (value) => {
        if (value === null || value === undefined) return true;
        const trimmed = value.trim();
        if (trimmed === '') return true;
        return isValidSocialHandle(platform, extractHandleCandidate(trimmed));
      },
      { message: `Invalid ${platform} handle` },
    )
    .transform((value): string | null | undefined => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const trimmed = value.trim();
      if (trimmed === '') return null;
      return extractHandleCandidate(trimmed);
    });
}

export const tenantSocialLinksBodySchema = z.object({
  instagramHandle: socialHandleField('instagram'),
  facebookHandle: socialHandleField('facebook'),
  twitterHandle: socialHandleField('twitter'),
});

export type TenantSocialLinksBody = z.infer<typeof tenantSocialLinksBodySchema>;
