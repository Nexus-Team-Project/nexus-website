/**
 * Tests the email-or-phone contact validation rule: manual create and import
 * rows need at least one of a valid email / valid Israeli phone; displayName
 * stays required on manual create.
 * Spec: docs/superpowers/specs/2026-07-15-members-service-invite-design.md s.4
 */
import { describe, it, expect } from 'vitest';
import { createContactSchema, importContactsSchema } from '../../src/schemas/domain-contacts.schemas';

describe('createContactSchema email-or-phone', () => {
  it('accepts email-only', () => {
    expect(createContactSchema.safeParse({ email: 'a@b.com', displayName: 'Alice' }).success).toBe(true);
  });

  it('accepts phone-only and normalizes +972 input', () => {
    const r = createContactSchema.safeParse({ phone: '+972508465858', displayName: 'Alice' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBe('0508465858');
  });

  it('rejects neither identifier', () => {
    expect(createContactSchema.safeParse({ displayName: 'Alice' }).success).toBe(false);
  });

  it('rejects a bad email even when a valid phone is present', () => {
    expect(
      createContactSchema.safeParse({ email: 'not-an-email', phone: '0508465858', displayName: 'Alice' }).success,
    ).toBe(false);
  });

  it('rejects a bad phone even when a valid email is present', () => {
    expect(
      createContactSchema.safeParse({ email: 'a@b.com', phone: '12345', displayName: 'Alice' }).success,
    ).toBe(false);
  });

  it('still requires displayName on manual create', () => {
    expect(createContactSchema.safeParse({ email: 'a@b.com' }).success).toBe(false);
  });
});

describe('importContactRowSchema email-or-phone', () => {
  it('accepts a phone-only row', () => {
    expect(importContactsSchema.safeParse({ rows: [{ phone: '0508465858' }] }).success).toBe(true);
  });

  it('treats an empty email cell as absent when a phone exists', () => {
    expect(importContactsSchema.safeParse({ rows: [{ email: '', phone: '0508465858' }] }).success).toBe(true);
  });

  it('rejects a row with neither identifier', () => {
    expect(importContactsSchema.safeParse({ rows: [{ displayName: 'X' }] }).success).toBe(false);
  });
});
