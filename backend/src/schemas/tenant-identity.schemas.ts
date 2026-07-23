/**
 * Zod schemas for post-onboarding tenant identity editing (name, description,
 * website, phone). Bounds and validators are the exact ones onboarding's
 * workspaceSetupBodySchema already enforces, reused so a value that was valid
 * at signup stays valid to re-save, and vice versa.
 */
import { z } from 'zod';
import { hasNoControlChars, isValidWebsite, phonePattern } from './onboarding.schemas';

export const tenantIdentityBodySchema = z.object({
  organizationName: z.string().trim().min(2).max(120).refine(hasNoControlChars, 'Invalid organization name').optional(),
  businessDescription: z.string().trim().min(20).max(1000).refine(hasNoControlChars, 'Invalid description').optional(),
  website: z.string().trim().min(3).max(200).refine(isValidWebsite, 'Invalid website').optional(),
});

export const tenantPhoneOtpStartBodySchema = z.object({
  phone: z.string().trim().min(7).max(20).regex(phonePattern),
});

export const tenantPhoneBodySchema = z.object({
  phone: z.string().trim().min(7).max(20).regex(phonePattern),
  challengeId: z.string().min(1).optional(),
  otpCode: z.string().trim().min(4).max(8).optional(),
});

export type TenantIdentityInput = z.infer<typeof tenantIdentityBodySchema>;
export type TenantPhoneOtpStartInput = z.infer<typeof tenantPhoneOtpStartBodySchema>;
export type TenantPhoneInput = z.infer<typeof tenantPhoneBodySchema>;
