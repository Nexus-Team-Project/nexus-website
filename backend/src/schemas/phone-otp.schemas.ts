/**
 * Zod schemas for the wallet phone-OTP routes.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 6
 */
import { z } from 'zod';

/** POST /api/v1/auth/phone/start - body. */
export const phoneStartSchema = z.object({
  phone: z.string().trim().min(7).max(20),
});
export type PhoneStartInput = z.infer<typeof phoneStartSchema>;

/** POST /api/v1/auth/phone/verify - body. */
export const phoneVerifySchema = z.object({
  challengeId: z.string().regex(/^[a-f0-9]{24}$/),
  code: z.string().regex(/^\d{6}$/),
});
export type PhoneVerifyInput = z.infer<typeof phoneVerifySchema>;

/** POST /api/v1/auth/phone/resend - body. */
export const phoneResendSchema = z.object({
  challengeId: z.string().regex(/^[a-f0-9]{24}$/),
});
export type PhoneResendInput = z.infer<typeof phoneResendSchema>;
