/**
 * Unit tests for the One Tap Monday lead producer: message building and
 * the production-only gating constant contract.
 */
import { describe, expect, it } from 'vitest';
import {
  buildOneTapLeadMessage,
  buildContactSalesColumnValues,
  ONE_TAP_LEAD_PRODUCTION_ONLY,
} from '../../src/services/monday-lead.service';

describe('buildOneTapLeadMessage', () => {
  it('leads with the email and includes the page when provided', () => {
    expect(buildOneTapLeadMessage('new@user.com', '/partners'))
      .toBe('new@user.com - Google One Tap signup (page: /partners)');
  });

  it('omits the page suffix when absent', () => {
    expect(buildOneTapLeadMessage('new@user.com')).toBe('new@user.com - Google One Tap signup');
  });
});

describe('one tap lead column values', () => {
  it('reuses the contact-sales column mapping with the one tap message', () => {
    const values = buildContactSalesColumnValues({
      email: 'new@user.com',
      name: 'New User',
      message: buildOneTapLeadMessage('new@user.com', '/he/partners'),
    });
    expect(values['text_mkm03xx']).toBe('new@user.com - Google One Tap signup (page: /he/partners)');
    expect(values['email_mkm011dr']).toEqual({ email: 'new@user.com', text: 'new@user.com' });
    expect(values['status']).toEqual({ label: 'Unqualified' });
  });
});

describe('ONE_TAP_LEAD_PRODUCTION_ONLY', () => {
  it('is true - one tap leads are production-only (testing phase over)', () => {
    expect(ONE_TAP_LEAD_PRODUCTION_ONLY).toBe(true);
  });
});
