/**
 * Service-outreach email tests: bilingual subject/body, RTL for Hebrew,
 * CTA points at the short link, and tenant-supplied text is HTML-escaped.
 * sendMail is mocked; we assert on the payload it receives.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/email.service', () => ({
  sendMail: vi.fn(async () => 'msg_1'),
  buildAuthEmailBannerHtml: vi.fn(() => '<img alt="banner"/>'),
}));

import { sendServiceOutreachEmail } from '../../../src/services/email/service-outreach-email.service';
import { sendMail } from '../../../src/services/email.service';

const mockedSendMail = vi.mocked(sendMail);

beforeEach(() => { mockedSendMail.mockClear(); });

describe('sendServiceOutreachEmail', () => {
  it('sends a Hebrew RTL email with the tenant name and CTA short link', async () => {
    const id = await sendServiceOutreachEmail({
      to: 'a@b.com', tenantName: 'Acme', ctaUrl: 'https://nxs.example/l/abc123', language: 'he',
    });
    expect(id).toBe('msg_1');
    const call = mockedSendMail.mock.calls[0][0];
    expect(call.to).toBe('a@b.com');
    expect(call.subject).toContain('Acme');
    expect(call.html).toContain('dir="rtl"');
    expect(call.html).toContain('https://nxs.example/l/abc123');
    expect(call.text).toContain('https://nxs.example/l/abc123');
  });

  it('sends an English LTR email', async () => {
    await sendServiceOutreachEmail({
      to: 'a@b.com', tenantName: 'Acme', ctaUrl: 'https://nxs.example/l/abc123', language: 'en',
    });
    const call = mockedSendMail.mock.calls[0][0];
    expect(call.html).toContain('dir="ltr"');
    expect(call.subject).toMatch(/Acme/);
  });

  it('HTML-escapes the tenant name', async () => {
    await sendServiceOutreachEmail({
      to: 'a@b.com', tenantName: '<img src=x onerror=1>', ctaUrl: 'https://x/l/1', language: 'en',
    });
    const call = mockedSendMail.mock.calls[0][0];
    expect(call.html).not.toContain('<img src=x');
    expect(call.html).toContain('&lt;img src=x');
  });
});
