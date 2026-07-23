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
  it('includes the page when provided', () => {
    expect(buildOneTapLeadMessage('/partners')).toBe('Google One Tap signup (page: /partners)');
  });

  it('omits the page suffix when absent', () => {
    expect(buildOneTapLeadMessage()).toBe('Google One Tap signup');
  });
});

describe('one tap lead column values', () => {
  it('reuses the contact-sales column mapping with the one tap message', () => {
    const values = buildContactSalesColumnValues({
      email: 'new@user.com',
      name: 'New User',
      message: buildOneTapLeadMessage('/he/partners'),
    });
    expect(values['text_mkm03xx']).toBe('Google One Tap signup (page: /he/partners)');
    expect(values['email_mkm011dr']).toEqual({ email: 'new@user.com', text: 'new@user.com' });
    expect(values['status']).toEqual({ label: 'Unqualified' });
  });
});

describe('ONE_TAP_LEAD_PRODUCTION_ONLY', () => {
  it('is false during the testing phase (leads fire in every env)', () => {
    // Planned flip to true after testing - see the spec follow-ups section.
    expect(ONE_TAP_LEAD_PRODUCTION_ONLY).toBe(false);
  });
});
