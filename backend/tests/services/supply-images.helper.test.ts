/**
 * Unit tests for reconcileImageCrops - the pure logic that rebuilds an offer's
 * per-image crop metadata after a gallery change. Crops are stored keyed by URL
 * (kept images) or aligned to upload order (new images); the result is aligned
 * to the final gallery, follows reorder, drops orphans, and omits null crops.
 */
import { describe, it, expect } from 'vitest';
import { reconcileImageCrops } from '../../src/services/supply-images.helper';
import type { ImageCrop, ImageCropEntry } from '../../src/models/domain/supply.models';

const A = 'https://res.cloudinary.com/demo/image/upload/a.jpg';
const B = 'https://res.cloudinary.com/demo/image/upload/b.jpg';
const N1 = 'https://res.cloudinary.com/demo/image/upload/n1.jpg';
const N2 = 'https://res.cloudinary.com/demo/image/upload/n2.jpg';

const crop = (x: number): ImageCrop => ({ x, y: 0, width: 0.5, height: 0.5 });
const entry = (url: string, x: number): ImageCropEntry => ({ url, crop: crop(x) });

describe('reconcileImageCrops', () => {
  it('keeps crops for kept images, matched by URL', () => {
    const out = reconcileImageCrops([A], [], [entry(A, 0.1)], undefined);
    expect(out).toEqual([entry(A, 0.1)]);
  });

  it('aligns new-image crops to upload order and skips null crops', () => {
    const out = reconcileImageCrops([N1, N2], [N1, N2], undefined, [crop(0.2), null]);
    expect(out).toEqual([{ url: N1, crop: crop(0.2) }]);
  });

  it('follows reorder (output ordered by finalUrls, not input)', () => {
    const out = reconcileImageCrops([B, A], [], [entry(A, 0.1), entry(B, 0.3)], undefined);
    expect(out.map((e) => e.url)).toEqual([B, A]);
  });

  it('drops crops for orphaned (removed) images', () => {
    const out = reconcileImageCrops([A], [], [entry(A, 0.1), entry(B, 0.3)], undefined);
    expect(out).toEqual([entry(A, 0.1)]);
  });

  it('omits kept images whose crop is null (full image)', () => {
    const out = reconcileImageCrops([A, B], [], [entry(A, 0.1), { url: B, crop: null }], undefined);
    expect(out).toEqual([entry(A, 0.1)]);
  });

  it('merges kept (by URL) and new (by order) crops in final order', () => {
    const out = reconcileImageCrops([A, N1], [N1], [entry(A, 0.1)], [crop(0.4)]);
    expect(out).toEqual([entry(A, 0.1), { url: N1, crop: crop(0.4) }]);
  });

  it('returns empty when no image carries a crop', () => {
    expect(reconcileImageCrops([A], [], undefined, undefined)).toEqual([]);
  });
});
