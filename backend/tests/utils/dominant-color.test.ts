/**
 * Tests for pickDominantColors - the pure selection of display-worthy fade
 * colors from a Cloudinary palette. The behavioral contract: near-white and
 * near-black background colors never win, malformed entries are ignored,
 * output is normalized lowercase '#rrggbb' (max 3, most common first), and a
 * fully-filtered (monochrome) palette still yields its top color.
 */
import { describe, it, expect } from 'vitest';
import { pickDominantColors } from '../../src/utils/dominant-color';

describe('pickDominantColors', () => {
  it('skips a dominant white background and picks the first real color', () => {
    // Typical logo-on-white palette (the McDonald's case).
    expect(
      pickDominantColors([
        ['#FFFFFF', 62.1],
        ['#FFC72C', 21.4],
        ['#DA291C', 9.2],
        ['#000000', 4.0],
      ]),
    ).toEqual(['#ffc72c', '#da291c']);
  });

  it('skips near-white and near-black by luma, not only pure #fff/#000', () => {
    expect(
      pickDominantColors([
        ['#FBFBFA', 70],
        ['#0A0A0B', 10],
        ['#336699', 20],
      ]),
    ).toEqual(['#336699']);
  });

  it('returns at most 3 colors, most common first, normalized lowercase', () => {
    expect(
      pickDominantColors([
        ['3366AA', 40],
        ['#CC2244', 30],
        ['#22AA66', 20],
        ['#997711', 10],
      ]),
    ).toEqual(['#3366aa', '#cc2244', '#22aa66']);
  });

  it('falls back to the top raw color when everything is filtered', () => {
    expect(pickDominantColors([['#FFFFFF', 90], ['#000000', 10]])).toEqual(['#ffffff']);
  });

  it('ignores malformed entries and returns [] for empty/missing palettes', () => {
    expect(pickDominantColors([['not-a-color', 50], ['#12345', 30], ['#445566', 20]])).toEqual(['#445566']);
    expect(pickDominantColors([])).toEqual([]);
    expect(pickDominantColors(null)).toEqual([]);
    expect(pickDominantColors(undefined)).toEqual([]);
    expect(pickDominantColors([['bad', 100]])).toEqual([]);
  });
});
