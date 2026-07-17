/**
 * SECURITY + contract tests for the cover request-assembly helper: dangerous
 * schemes rejected before any fetch, kept entries must be Cloudinary-hosted
 * (a raw user URL can never be persisted), URL length cap, the 5-image cap,
 * order (kept -> files -> remote), and crop alignment. Cloudinary calls are
 * mocked - assertions include that NO upload happens on rejected input.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploadTenantCoverMock = vi.fn(async (_b: Buffer, name: string) =>
  `https://res.cloudinary.com/demo/image/upload/nexus/tenant-covers/file-${name}`);
const uploadFromUrlMock = vi.fn(async (url: string) =>
  `https://res.cloudinary.com/demo/image/upload/nexus/tenant-covers/remote-${url.split('/').pop()}`);

vi.mock('../../src/utils/cloudinary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/cloudinary')>()),
  uploadTenantCover: (b: Buffer, n: string) => uploadTenantCoverMock(b, n),
  uploadOfferImageFromUrl: (u: string, f?: string) => uploadFromUrlMock(u, f as never),
}));

import { buildCoverEntriesFromRequest } from '../../src/services/tenant-cover.helper';

/** Minimal multer-file stub. */
function file(name: string): Express.Multer.File {
  return { buffer: Buffer.from('x'), originalname: name, mimetype: 'image/png' } as Express.Multer.File;
}

beforeEach(() => {
  uploadTenantCoverMock.mockClear();
  uploadFromUrlMock.mockClear();
});

describe('buildCoverEntriesFromRequest', () => {
  it('orders kept -> files -> remote with aligned crops', async () => {
    const crop = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
    const entries = await buildCoverEntriesFromRequest([file('a.png')], {
      keptImages: JSON.stringify([{ url: 'https://res.cloudinary.com/demo/image/upload/k1.jpg', crop }]),
      newFileCrops: JSON.stringify([null]),
      remoteImages: JSON.stringify([{ url: 'https://example.com/r1.jpg', crop }]),
    });
    expect(entries.map((e) => e.url)).toEqual([
      'https://res.cloudinary.com/demo/image/upload/k1.jpg',
      'https://res.cloudinary.com/demo/image/upload/nexus/tenant-covers/file-a.png',
      'https://res.cloudinary.com/demo/image/upload/nexus/tenant-covers/remote-r1.jpg',
    ]);
    expect(entries[0]!.crop).toEqual(crop);
    expect(entries[1]!.crop).toBeNull();
    expect(entries[2]!.crop).toEqual(crop);
  });

  it('rejects dangerous remote schemes BEFORE any fetch', async () => {
    for (const url of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///etc/passwd', 'not a url']) {
      await expect(buildCoverEntriesFromRequest([], {
        remoteImages: JSON.stringify([{ url, crop: null }]),
      })).rejects.toMatchObject({ status: 400 });
    }
    expect(uploadFromUrlMock).not.toHaveBeenCalled();
  });

  it('rejects a non-Cloudinary kept URL (raw user URLs can never persist)', async () => {
    await expect(buildCoverEntriesFromRequest([], {
      keptImages: JSON.stringify([{ url: 'https://evil.example.com/x.jpg', crop: null }]),
    })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an oversized remote URL', async () => {
    const huge = `https://example.com/${'a'.repeat(3000)}.jpg`;
    await expect(buildCoverEntriesFromRequest([], {
      remoteImages: JSON.stringify([{ url: huge, crop: null }]),
    })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects when kept + files + remote exceed the cap, uploading nothing', async () => {
    const kept = Array.from({ length: 3 }, (_, i) => ({
      url: `https://res.cloudinary.com/demo/image/upload/k${i}.jpg`, crop: null,
    }));
    await expect(buildCoverEntriesFromRequest([file('a.png'), file('b.png')], {
      keptImages: JSON.stringify(kept),
      remoteImages: JSON.stringify([{ url: 'https://example.com/r.jpg', crop: null }]),
    })).rejects.toMatchObject({ status: 400 });
    expect(uploadTenantCoverMock).not.toHaveBeenCalled();
    expect(uploadFromUrlMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON fields with a 400', async () => {
    await expect(buildCoverEntriesFromRequest([], { keptImages: '{not json' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('empty request yields an empty set (clears the gallery)', async () => {
    expect(await buildCoverEntriesFromRequest([], {})).toEqual([]);
  });
});
