/**
 * Zod schemas for /api/v1/wallet/profile and /api/v1/wallet/marketing-consent.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 4.1 and 6
 */
import { z } from 'zod';

/** PATCH /api/v1/wallet/profile - body. Any subset is allowed. */
export const walletProfilePatchSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  // Accept ISO string from the wallet; service parses to Date.
  birthday: z.string().datetime().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  lifeStage: z.string().trim().min(1).max(100).optional(),
  motivation: z.string().trim().min(1).max(200).optional(),
  purpose: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  inviteFriendsSent: z.number().int().min(0).max(10000).optional(),
  /** Set to true to stamp completedAt and gate the slide chain for returning users. */
  complete: z.boolean().optional(),
});
export type WalletProfilePatchInput = z.infer<typeof walletProfilePatchSchema>;

/** PATCH /api/v1/wallet/marketing-consent - body. */
export const walletMarketingConsentSchema = z.object({
  granted: z.boolean(),
  source: z.enum(['wallet_signup', 'wallet_settings']),
});
export type WalletMarketingConsentInput = z.infer<typeof walletMarketingConsentSchema>;
