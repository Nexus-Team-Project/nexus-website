/**
 * Unit tests for the offer image-crop Zod schemas (imageCropSchema +
 * imageCropEntrySchema). These guard the normalized-fraction crop contract that
 * the offer routes accept and store on NexusOffer.imageCrops: fractions in
 * [0,1], positive width/height, and in-bounds (x+width<=1, y+height<=1) with a
 * small epsilon for editor rounding.
 */
import { describe, it, expect } from 'vitest';
import {
  imageCropSchema,
  imageCropEntrySchema,
  CROP_EPSILON,
} from '../../src/models/domain/supply.models';

describe('imageCropSchema', () => {
  it('accepts a valid centered crop', () => {
    const r = imageCropSchema.safeParse({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
    expect(r.success).toBe(true);
  });

  it('accepts optional aspect + natural dimensions', () => {
    const r = imageCropSchema.safeParse({
      x: 0, y: 0, width: 1, height: 1, aspect: 1.5, naturalWidth: 4000, naturalHeight: 3000,
    });
    expect(r.success).toBe(true);
  });

  it('rejects width of zero (must be > 0)', () => {
    expect(imageCropSchema.safeParse({ x: 0, y: 0, width: 0, height: 0.5 }).success).toBe(false);
  });

  it('rejects a negative offset', () => {
    expect(imageCropSchema.safeParse({ x: -0.01, y: 0, width: 0.5, height: 0.5 }).success).toBe(false);
  });

  it('rejects a fraction above 1', () => {
    expect(imageCropSchema.safeParse({ x: 0, y: 0, width: 1.2, height: 0.5 }).success).toBe(false);
  });

  it('rejects x + width beyond the right edge', () => {
    expect(imageCropSchema.safeParse({ x: 0.6, y: 0, width: 0.6, height: 0.5 }).success).toBe(false);
  });

  it('rejects y + height beyond the bottom edge', () => {
    expect(imageCropSchema.safeParse({ x: 0, y: 0.7, width: 0.5, height: 0.6 }).success).toBe(false);
  });

  it('tolerates rounding within CROP_EPSILON but not beyond it', () => {
    expect(
      imageCropSchema.safeParse({ x: 0.5, y: 0, width: 0.5 + CROP_EPSILON / 2, height: 0.5 }).success,
    ).toBe(true);
    expect(
      imageCropSchema.safeParse({ x: 0.5, y: 0, width: 0.5 + CROP_EPSILON * 2, height: 0.5 }).success,
    ).toBe(false);
  });
});

describe('imageCropEntrySchema', () => {
  it('accepts an entry with a crop', () => {
    const r = imageCropEntrySchema.safeParse({
      url: 'https://res.cloudinary.com/demo/image/upload/x.jpg',
      crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
    });
    expect(r.success).toBe(true);
  });

  it('accepts an entry with a null crop (full image)', () => {
    const r = imageCropEntrySchema.safeParse({
      url: 'https://res.cloudinary.com/demo/image/upload/x.jpg',
      crop: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejects a non-URL', () => {
    expect(imageCropEntrySchema.safeParse({ url: 'not-a-url', crop: null }).success).toBe(false);
  });
});
