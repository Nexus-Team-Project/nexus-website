/**
 * Shared password policy for ALL password-setting surfaces (website register,
 * website reset, wallet signup, wallet reset). Rules: 8-128 chars, a digit,
 * lower+upper case, and a special char (same set as the website strength
 * meter). Existing weak passwords remain valid for LOGIN; this gates only
 * NEW passwords.
 * Spec: docs/superpowers/specs/2026-07-14-wallet-email-password-auth-design.md
 */
import { z } from 'zod';

/** Special-character class, kept identical to the website signup meter. */
export const PASSWORD_SPECIAL_CHARS = /[!@#$%^&*(),.?":{}|<>]/;

/** Machine-readable policy violations. */
export type PasswordPolicyIssue =
  | 'too_short'
  | 'too_long'
  | 'needs_digit'
  | 'needs_case'
  | 'needs_special';

/**
 * List every policy rule the candidate password violates.
 * Input: the raw candidate password. Output: [] when fully compliant.
 */
export function passwordPolicyIssues(pwd: string): PasswordPolicyIssue[] {
  const issues: PasswordPolicyIssue[] = [];
  if (pwd.length < 8) issues.push('too_short');
  if (pwd.length > 128) issues.push('too_long');
  if (!/\d/.test(pwd)) issues.push('needs_digit');
  if (!(/[a-z]/.test(pwd) && /[A-Z]/.test(pwd))) issues.push('needs_case');
  if (!PASSWORD_SPECIAL_CHARS.test(pwd)) issues.push('needs_special');
  return issues;
}

/** True when the password satisfies every policy rule. */
export function isPasswordPolicyCompliant(pwd: string): boolean {
  return passwordPolicyIssues(pwd).length === 0;
}

/** Zod schema form of the policy for route validation boundaries. */
export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine((p) => isPasswordPolicyCompliant(p), { message: 'weak_password' });
