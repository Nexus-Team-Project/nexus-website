/**
 * Tests for tenant-identity Zod schemas: same bounds onboarding's
 * workspaceSetupBodySchema enforces, applied as independently-optional
 * partial-update fields.
 */
import { describe, it, expect } from 'vitest';
import {
  tenantIdentityBodySchema,
  tenantPhoneOtpStartBodySchema,
  tenantPhoneBodySchema,
} from '../../src/schemas/tenant-identity.schemas';

describe('tenantIdentityBodySchema', () => {
  it('accepts a partial update with only one field', () => {
    const parsed = tenantIdentityBodySchema.parse({ organizationName: 'Acme Co' });
    expect(parsed).toEqual({ organizationName: 'Acme Co' });
  });

  it('accepts all three fields together', () => {
    const parsed = tenantIdentityBodySchema.parse({
      organizationName: 'Acme Co',
      businessDescription: 'A description that is long enough to pass validation checks here.',
      website: 'https://acme.example.com',
    });
    expect(parsed.website).toBe('https://acme.example.com');
  });

  it('rejects an invalid website', () => {
    expect(() => tenantIdentityBodySchema.parse({ website: 'not a website' })).toThrow();
  });

  it('rejects a too-short organization name', () => {
    expect(() => tenantIdentityBodySchema.parse({ organizationName: 'A' })).toThrow();
  });

  it('rejects a too-short business description', () => {
    expect(() => tenantIdentityBodySchema.parse({ businessDescription: 'too short' })).toThrow();
  });

  it('rejects control characters in the organization name', () => {
    expect(() => tenantIdentityBodySchema.parse({ organizationName: 'Acme\x00Co' })).toThrow();
  });
});

describe('tenantPhoneOtpStartBodySchema', () => {
  it('accepts a phone-shaped string', () => {
    expect(tenantPhoneOtpStartBodySchema.parse({ phone: '+972508465858' })).toEqual({
      phone: '+972508465858',
    });
  });

  it('rejects a missing phone', () => {
    expect(() => tenantPhoneOtpStartBodySchema.parse({})).toThrow();
  });
});

describe('tenantPhoneBodySchema', () => {
  it('accepts phone only (foreign number path)', () => {
    const parsed = tenantPhoneBodySchema.parse({ phone: '+14155551234' });
    expect(parsed).toEqual({ phone: '+14155551234' });
  });

  it('accepts phone + challengeId + otpCode (Israeli path)', () => {
    const parsed = tenantPhoneBodySchema.parse({
      phone: '0508465858',
      challengeId: 'abc123',
      otpCode: '123456',
    });
    expect(parsed.otpCode).toBe('123456');
  });
});
