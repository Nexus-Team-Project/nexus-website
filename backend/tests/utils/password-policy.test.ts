/**
 * Tests for the shared password policy used by website register/reset and the
 * wallet email+password flows.
 * Spec: docs/superpowers/specs/2026-07-14-wallet-email-password-auth-design.md
 */
import { describe, it, expect } from 'vitest';
import {
  passwordPolicyIssues,
  isPasswordPolicyCompliant,
  passwordSchema,
} from '../../src/utils/password-policy';

describe('password-policy', () => {
  it('accepts a compliant password', () => {
    expect(passwordPolicyIssues('Str0ng!pass')).toEqual([]);
    expect(isPasswordPolicyCompliant('Str0ng!pass')).toBe(true);
    expect(passwordSchema.safeParse('Str0ng!pass').success).toBe(true);
  });

  it('flags each missing rule', () => {
    expect(passwordPolicyIssues('Ab1!')).toContain('too_short');
    expect(passwordPolicyIssues('Abcdefg!')).toContain('needs_digit');
    expect(passwordPolicyIssues('abcdefg1!')).toContain('needs_case');
    expect(passwordPolicyIssues('ABCDEFG1!')).toContain('needs_case');
    expect(passwordPolicyIssues('Abcdefg1')).toContain('needs_special');
    expect(passwordPolicyIssues('a'.repeat(129) + 'A1!')).toContain('too_long');
  });

  it('rejects non-compliant via the schema', () => {
    expect(passwordSchema.safeParse('weakpass').success).toBe(false);
  });
});
