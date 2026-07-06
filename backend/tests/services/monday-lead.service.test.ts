/**
 * Tests for the Monday onboarding-lead column payload builder (pure - no
 * network). Column ids + labels were verified live against board 1767743351
 * on 2026-07-06.
 */
import { describe, it, expect } from 'vitest';
import { buildLeadColumnValues, buildContactSalesColumnValues } from '../../src/services/monday-lead.service';

const base = {
  fullName: 'Israel Israeli',
  contactRole: 'ceo',
  organizationName: 'Acme Ltd',
  website: 'acme.co.il',
  phone: '+972508465858',
  tenantId: 'abc123',
};

describe('buildLeadColumnValues', () => {
  it('maps the role to its Hebrew Title dropdown label', () => {
    const v = buildLeadColumnValues(base);
    expect(v['dropdown_mkm0m481']).toEqual({ labels: ['מנכ"ל'] });
  });

  it('maps all fixed tag columns', () => {
    const v = buildLeadColumnValues(base);
    expect(v['status']).toEqual({ label: 'Unqualified' });
    expect(v['color_mm4rpaac']).toEqual({ label: 'High' });
    expect(v['color_mkp0zbmj']).toEqual({ label: 'High' });
  });

  it('maps company text and a scheme-prefixed domain link', () => {
    const v = buildLeadColumnValues(base);
    expect(v['text_mkm03xx']).toBe('Acme Ltd');
    expect(v['link_mkm069yq']).toEqual({ url: 'https://acme.co.il', text: 'acme.co.il' });
  });

  it('keeps an existing scheme on the domain', () => {
    const v = buildLeadColumnValues({ ...base, website: 'http://acme.co.il/x' });
    expect(v['link_mkm069yq']).toEqual({ url: 'http://acme.co.il/x', text: 'http://acme.co.il/x' });
  });

  it('formats an Israeli phone with IL country code', () => {
    const v = buildLeadColumnValues(base);
    expect(v['phone_mkm0hsrh']).toEqual({ phone: '0508465858', countryShortName: 'IL' });
  });

  it('passes a foreign phone through digits-only without a country', () => {
    const v = buildLeadColumnValues({ ...base, phone: '+1 (415) 555-1234' });
    expect(v['phone_mkm0hsrh']).toEqual({ phone: '+14155551234' });
  });

  it('maps the Hebrew label for every contact role', () => {
    for (const [role, label] of Object.entries({
      owner: 'בעלים', ceo: 'מנכ"ל', finance: 'כספים', operations: 'תפעול',
      marketing: 'שיווק', product: 'מוצר', developer: 'פיתוח', other: 'אחר',
    })) {
      const v = buildLeadColumnValues({ ...base, contactRole: role });
      expect(v['dropdown_mkm0m481']).toEqual({ labels: [label] });
    }
  });
});

describe('buildContactSalesColumnValues', () => {
  const form = { email: 'lead@example.com', message: 'I want a demo' };

  it('fills the defaults the form does not carry', () => {
    const v = buildContactSalesColumnValues(form);
    expect(v['dropdown_mkm0m481']).toEqual({ labels: ['אחר'] });
    expect(v['status']).toEqual({ label: 'Unqualified' });
    expect(v['color_mm4rpaac']).toEqual({ label: 'High' });
    expect(v['color_mkp0zbmj']).toEqual({ label: 'High' });
  });

  it('puts the inquiry message in the free-text Company column', () => {
    const v = buildContactSalesColumnValues(form);
    expect(v['text_mkm03xx']).toBe('I want a demo');
  });

  it('maps the email column and omits phone when absent', () => {
    const v = buildContactSalesColumnValues(form);
    expect(v['email_mkm011dr']).toEqual({ email: 'lead@example.com', text: 'lead@example.com' });
    expect(v['phone_mkm0hsrh']).toBeUndefined();
  });

  it('formats an Israeli phone with IL country code when provided', () => {
    const v = buildContactSalesColumnValues({ ...form, phone: '+972508465858' });
    expect(v['phone_mkm0hsrh']).toEqual({ phone: '0508465858', countryShortName: 'IL' });
  });

  it('passes a foreign phone through digits-only', () => {
    const v = buildContactSalesColumnValues({ ...form, phone: '+1 (415) 555-1234' });
    expect(v['phone_mkm0hsrh']).toEqual({ phone: '+14155551234' });
  });
});
