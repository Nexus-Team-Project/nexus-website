/**
 * Unit tests for findConflictingCodes - the pure cross-link code-uniqueness
 * check used by addLinks (voucher link inventory). A non-empty code paired with
 * two or more DISTINCT links is a conflict; the same code on the same URL
 * (idempotent re-add) is not, and empty codes are ignored. No DB.
 */
import { describe, it, expect } from 'vitest';
import { findConflictingCodes, type LinkItem } from '../../src/services/voucher-inventory.service';

const link = (url: string, code?: string): LinkItem => ({ url, ...(code ? { code } : {}) });

describe('findConflictingCodes', () => {
  it('returns no conflict for distinct links with distinct codes', () => {
    const items = [link('https://a.com', 'AAA'), link('https://b.com', 'BBB')];
    expect(findConflictingCodes(items, [])).toEqual([]);
  });

  it('flags a code shared by two different links in the batch', () => {
    const items = [link('https://a.com', 'SAME'), link('https://b.com', 'SAME')];
    expect(findConflictingCodes(items, [])).toEqual(['SAME']);
  });

  it('ignores empty / missing codes (the code is optional)', () => {
    const items = [link('https://a.com'), link('https://b.com'), link('https://c.com', '  ')];
    expect(findConflictingCodes(items, [])).toEqual([]);
  });

  it('does not flag the same code on the same URL (idempotent re-add)', () => {
    const items = [link('https://a.com', 'SAME'), link('https://a.com', 'SAME')];
    expect(findConflictingCodes(items, [])).toEqual([]);
  });

  it('matches codes exactly after trimming surrounding whitespace', () => {
    const items = [link('https://a.com', ' SAME '), link('https://b.com', 'SAME')];
    expect(findConflictingCodes(items, [])).toEqual(['SAME']);
  });

  it('treats codes as case-sensitive (different case is not a conflict)', () => {
    const items = [link('https://a.com', 'code'), link('https://b.com', 'CODE')];
    expect(findConflictingCodes(items, [])).toEqual([]);
  });

  it('flags a batch code that collides with an existing stored link on a different URL', () => {
    const items = [link('https://new.com', 'KEEP')];
    const existing = [{ value: 'https://old.com', code: 'KEEP' }];
    expect(findConflictingCodes(items, existing)).toEqual(['KEEP']);
  });

  it('does not flag when the existing link is the same URL (re-add on edit)', () => {
    const items = [link('https://same.com', 'KEEP')];
    const existing = [{ value: 'https://same.com', code: 'KEEP' }];
    expect(findConflictingCodes(items, existing)).toEqual([]);
  });

  it('returns all conflicting codes sorted', () => {
    const items = [
      link('https://a.com', 'ZED'),
      link('https://b.com', 'ZED'),
      link('https://c.com', 'ALPHA'),
      link('https://d.com', 'ALPHA'),
    ];
    expect(findConflictingCodes(items, [])).toEqual(['ALPHA', 'ZED']);
  });
});
