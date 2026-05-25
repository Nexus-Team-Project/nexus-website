/**
 * Zod schema for the Google-wallet login route.
 * Accepts either { idToken } (GIS / popup flow) or
 * { code, redirectUri } (full-page redirect flow). At least one of
 * the two valid combinations must be present.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 6
 */
import { z } from 'zod';

/** POST /api/v1/auth/google/wallet - body. */
export const googleWalletSchema = z
  .object({
    idToken: z.string().min(20).optional(),
    code: z.string().min(10).optional(),
    redirectUri: z.string().url().optional(),
  })
  .refine(
    (data) => Boolean(data.idToken) || (Boolean(data.code) && Boolean(data.redirectUri)),
    { message: 'either_idToken_or_code_with_redirectUri_required' },
  );
export type GoogleWalletInput = z.infer<typeof googleWalletSchema>;
