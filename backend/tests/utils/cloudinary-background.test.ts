/**
 * No-network tests for the tenant-logo background removal helper. Mocks
 * global.fetch (the public derived-image GET) and the signed re-upload
 * (`uploadTenantLogo`) so no Cloudinary call is made. Verifies the derived-URL
 * shape, the 423 polling behavior, and that every failure mode resolves to
 * null (the caller keeps the original logo) instead of throwing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/env', () => ({
  env: { CLOUDINARY_URL: 'cloudinary://key:secret@testcloud' },
}));

vi.mock('../../src/utils/cloudinary', () => ({
  uploadTenantLogo: vi.fn(),
}));

import { removeLogoBackground } from '../../src/utils/cloudinary-background';
import { uploadTenantLogo } from '../../src/utils/cloudinary';

const ORIGINAL_URL =
  'https://res.cloudinary.com/testcloud/image/upload/v123/nexus/tenant-logos/1710-acme_logo.jpg';
const REUPLOADED_URL =
  'https://res.cloudinary.com/testcloud/image/upload/v124/nexus/tenant-logos/1711-acme_logo-nobg.png';

/** Builds a minimal fetch Response stand-in for the derived-image GET. */
function response(status: number): { ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer> } {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  };
}

beforeEach(() => {
  vi.mocked(uploadTenantLogo).mockReset();
  vi.mocked(uploadTenantLogo).mockResolvedValue(REUPLOADED_URL);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('removeLogoBackground', () => {
  it('skips non-Cloudinary URLs without any network call', async () => {
    global.fetch = vi.fn();
    await expect(removeLogoBackground('https://example.com/logo.png')).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(uploadTenantLogo).not.toHaveBeenCalled();
  });

  it('requests the e_background_removal/f_png derived URL and re-uploads the PNG', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(response(200));
    await expect(removeLogoBackground(ORIGINAL_URL)).resolves.toBe(REUPLOADED_URL);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://res.cloudinary.com/testcloud/image/upload/e_background_removal/f_png/v123/nexus/tenant-logos/1710-acme_logo.jpg',
    );
    const [buffer, filename] = vi.mocked(uploadTenantLogo).mock.calls[0];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(filename).toBe('1710-acme_logo-nobg.png');
  });

  it('polls through 423 (processing) responses until the image is ready', async () => {
    vi.useFakeTimers();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(response(423))
      .mockResolvedValueOnce(response(423))
      .mockResolvedValueOnce(response(200));
    const pending = removeLogoBackground(ORIGINAL_URL);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(pending).resolves.toBe(REUPLOADED_URL);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('gives up after the poll cap and keeps the original (null)', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue(response(423));
    const pending = removeLogoBackground(ORIGINAL_URL);
    await vi.advanceTimersByTimeAsync(20 * 2000);
    await expect(pending).resolves.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(20);
    expect(uploadTenantLogo).not.toHaveBeenCalled();
  });

  it('returns null on a non-423 failure without retrying', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(response(400));
    await expect(removeLogoBackground(ORIGINAL_URL)).resolves.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(uploadTenantLogo).not.toHaveBeenCalled();
  });

  it('returns null when the derived-image fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('network down'));
    await expect(removeLogoBackground(ORIGINAL_URL)).resolves.toBeNull();
  });

  it('returns null when the re-upload fails', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(response(200));
    vi.mocked(uploadTenantLogo).mockRejectedValueOnce(new Error('upload failed'));
    await expect(removeLogoBackground(ORIGINAL_URL)).resolves.toBeNull();
  });
});
