/**
 * Zod schema for the Google-wallet login route.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 6
 */
import { z } from 'zod';

/** POST /api/v1/auth/google/wallet - body. */
export const googleWalletSchema = z.object({
  idToken: z.string().min(20),
});
export type GoogleWalletInput = z.infer<typeof googleWalletSchema>;
