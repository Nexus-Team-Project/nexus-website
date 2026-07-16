/**
 * Zod schemas for the wallet magic-link routes.
 * Spec: docs/superpowers/specs/2026-07-16-wallet-email-magic-link-auth-design.md
 */
import { z } from 'zod';

/** POST /api/v1/auth/magic-link/start - body. */
export const magicLinkStartSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  lang: z.enum(['he', 'en']).optional(),
});
export type MagicLinkStartInput = z.infer<typeof magicLinkStartSchema>;

/** POST /api/v1/auth/magic-link/consume - body. base64url token, 32 bytes -> 43 chars. */
export const magicLinkConsumeSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export type MagicLinkConsumeInput = z.infer<typeof magicLinkConsumeSchema>;
