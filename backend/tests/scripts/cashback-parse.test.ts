/**
 * Unit tests for the CSV cashback percent parser and the partner-name
 * normalizer used by the one-time import script.
 */
import { describe, expect, it } from 'vitest';
import { parseCashbackPct, normalizePartnerName } from '../../scripts/import-partner-cashback/parse';

describe('parseCashbackPct', () => {
  it('extracts a whole percent', () => {
    expect(parseCashbackPct('60% הנחה')).toBe(60);
  });

  it('extracts from "עד X%" phrasing', () => {
    expect(parseCashbackPct('עד 15% הנחה')).toBe(15);
  });

  it('keeps fractional percents', () => {
    expect(parseCashbackPct('4.5% הנחה')).toBe(4.5);
  });

  it('takes only the FIRST percent in the cell', () => {
    expect(parseCashbackPct('50% הנחה או 20% כולל כפל מבצעים')).toBe(50);
  });

  it('returns null when no percent exists', () => {
    expect(parseCashbackPct('הטבה מיוחדת לחברי מועדון')).toBeNull();
    expect(parseCashbackPct('')).toBeNull();
  });
});

describe('normalizePartnerName', () => {
  it('lowercases, trims, collapses spaces, strips punctuation marks', () => {
    expect(normalizePartnerName('  KITAN ')).toBe('kitan');
    expect(normalizePartnerName("רודי פרוג'קט")).toBe('רודי פרוגקט');
    expect(normalizePartnerName('GOLF&CO')).toBe('golf&co');
    expect(normalizePartnerName('The  Children’s Place')).toBe('the childrens place');
  });
});
