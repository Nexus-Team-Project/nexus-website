/**
 * Zod schemas for the wallet email-OTP routes.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 6
 */
import { z } from 'zod';

/** POST /api/v1/auth/email-otp/start - body. */
export const emailStartSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  signupTicketId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  lang: z.enum(['he', 'en']).optional(),
});
export type EmailStartInput = z.infer<typeof emailStartSchema>;

/** POST /api/v1/auth/email-otp/verify - body. */
export const emailVerifySchema = z.object({
  challengeId: z.string().regex(/^[a-f0-9]{24}$/),
  code: z.string().regex(/^\d{6}$/),
});
export type EmailVerifyInput = z.infer<typeof emailVerifySchema>;
