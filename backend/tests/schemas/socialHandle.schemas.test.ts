/**
 * Tests the tenant social-handle validation: a tenant can paste a bare
 * handle, an @handle, or a full profile URL, and the schema always reduces
 * it to a validated bare handle - never a stored domain.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSocialUrl,
  extractHandleCandidate,
  isValidSocialHandle,
  tenantSocialLinksBodySchema,
} from '../../src/schemas/socialHandle.schemas';

describe('extractHandleCandidate', () => {
  it('passes through a bare handle unchanged', () => {
    expect(extractHandleCandidate('nexuspay')).toBe('nexuspay');
  });

  it('strips a leading @', () => {
    expect(extractHandleCandidate('@nexuspay')).toBe('nexuspay');
  });

  it('takes the last path segment of a full pasted URL', () => {
    expect(extractHandleCandidate('https://instagram.com/nexuspay')).toBe('nexuspay');
    expect(extractHandleCandidate('https://instagram.com/nexuspay/')).toBe('nexuspay');
  });

  it('ignores query strings and hashes on a pasted URL', () => {
    expect(extractHandleCandidate('https://x.com/nexuspay?ref=bio#top')).toBe('nexuspay');
  });
});

describe('isValidSocialHandle', () => {
  it('accepts a well-formed handle per platform', () => {
    expect(isValidSocialHandle('instagram', 'nexus.pay_1')).toBe(true);
    expect(isValidSocialHandle('facebook', 'nexuspayofficial')).toBe(true);
    expect(isValidSocialHandle('twitter', 'nexuspay')).toBe(true);
  });

  it('rejects a twitter/X handle over 15 characters', () => {
    expect(isValidSocialHandle('twitter', 'wayTooLongHandleName')).toBe(false);
  });

  it('rejects characters outside the platform charset', () => {
    expect(isValidSocialHandle('instagram', 'nexus pay')).toBe(false);
    expect(isValidSocialHandle('twitter', 'nexus.pay')).toBe(false);
  });

  it('rejects an empty handle', () => {
    expect(isValidSocialHandle('facebook', '')).toBe(false);
  });
});

describe('buildSocialUrl', () => {
  it('builds the canonical URL from our own hardcoded domain', () => {
    expect(buildSocialUrl('instagram', 'nexuspay')).toBe('https://instagram.com/nexuspay');
    expect(buildSocialUrl('facebook', 'nexuspay')).toBe('https://facebook.com/nexuspay');
    expect(buildSocialUrl('twitter', 'nexuspay')).toBe('https://x.com/nexuspay');
  });
});

describe('tenantSocialLinksBodySchema', () => {
  it('leaves a field untouched when its key is absent', () => {
    const parsed = tenantSocialLinksBodySchema.parse({});
    expect(parsed.instagramHandle).toBeUndefined();
    expect(parsed.facebookHandle).toBeUndefined();
    expect(parsed.twitterHandle).toBeUndefined();
  });

  it('clears a field on null or an empty/whitespace string', () => {
    expect(tenantSocialLinksBodySchema.parse({ instagramHandle: null }).instagramHandle).toBeNull();
    expect(tenantSocialLinksBodySchema.parse({ instagramHandle: '' }).instagramHandle).toBeNull();
    expect(tenantSocialLinksBodySchema.parse({ instagramHandle: '   ' }).instagramHandle).toBeNull();
  });

  it('reduces a pasted full URL to a bare handle before storing', () => {
    const parsed = tenantSocialLinksBodySchema.parse({ twitterHandle: 'https://x.com/nexuspay' });
    expect(parsed.twitterHandle).toBe('nexuspay');
  });

  it('reduces an @handle to a bare handle before storing', () => {
    const parsed = tenantSocialLinksBodySchema.parse({ facebookHandle: '@nexuspay.official' });
    expect(parsed.facebookHandle).toBe('nexuspay.official');
  });

  it('rejects a handle that fails the platform charset/length rule', () => {
    expect(() => tenantSocialLinksBodySchema.parse({ twitterHandle: 'this_handle_is_way_too_long' })).toThrow();
  });

  it('rejects a domain that does not belong to the platform (still just a handle, not trusted as a link)', () => {
    // Pasting a lookalike/other-site URL just yields an invalid "handle" (the
    // last path segment), which the charset/length rule then rejects - the
    // schema never trusts or stores the domain part of any input.
    expect(() =>
      tenantSocialLinksBodySchema.parse({ instagramHandle: 'https://evil-phishing-site.com/not a real handle' }),
    ).toThrow();
  });
});
