/**
 * No-network tests for the Cloudinary URL pre-check used by upload-from-URL.
 * `isUploadableImageUrl` is the cheap guard that decides whether a CSV cell is
 * worth handing to Cloudinary's fetch (the fetch itself is the real validator).
 */
import { describe, it, expect } from 'vitest';
import { isUploadableImageUrl, uploadOfferImageFromUrl } from '../../src/utils/cloudinary';

describe('isUploadableImageUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(isUploadableImageUrl('https://example.com/a.jpg')).toBe(true);
    expect(isUploadableImageUrl('http://cdn.example.com/x/y.png')).toBe(true);
    expect(isUploadableImageUrl('  https://example.com/a.jpg  ')).toBe(true); // trimmed
  });

  it('rejects free text, non-http schemes, and non-strings', () => {
    expect(isUploadableImageUrl('not a url')).toBe(false);
    expect(isUploadableImageUrl('')).toBe(false);
    expect(isUploadableImageUrl('ftp://example.com/a.jpg')).toBe(false);
    expect(isUploadableImageUrl('javascript:alert(1)')).toBe(false);
    expect(isUploadableImageUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isUploadableImageUrl(null)).toBe(false);
    expect(isUploadableImageUrl(123)).toBe(false);
  });
});

describe('uploadOfferImageFromUrl guard', () => {
  it('rejects a non-http(s) value before any network call', async () => {
    await expect(uploadOfferImageFromUrl('not a url')).rejects.toThrow(/http\(s\) URL/i);
  });
});
