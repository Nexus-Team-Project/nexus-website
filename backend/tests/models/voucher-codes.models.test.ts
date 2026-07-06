/**
 * Unit tests for the voucher inventory model helpers. Covers the MOCK barcode
 * value generator's format + uniqueness (the DB-bound service behavior —
 * append, stockLimit sync, cap — is enforced via Zod + exercised manually,
 * since there is no offer DB integration harness in this repo).
 */
import { describe, it, expect } from 'vitest';
import {
  mockBarcodeValue,
  voucherCodeSchema,
  VOUCHER_INVENTORY_MAX,
  VOUCHER_CODE_KINDS,
  VOUCHER_CODE_STATUSES,
  VOUCHER_CODE_REGEX,
  VOUCHER_CODE_MAX_LENGTH,
} from '../../src/models/domain/voucher-codes.models';

describe('mockBarcodeValue', () => {
  it('formats as MOCK-#### zero-padded to 4 digits', () => {
    expect(mockBarcodeValue(1)).toBe('MOCK-0001');
    expect(mockBarcodeValue(42)).toBe('MOCK-0042');
    expect(mockBarcodeValue(9999)).toBe('MOCK-9999');
  });

  it('keeps growing past 4 digits without truncating', () => {
    expect(mockBarcodeValue(12345)).toBe('MOCK-12345');
  });

  it('produces unique values across a contiguous range (append-safe)', () => {
    const values = Array.from({ length: 1000 }, (_, i) => mockBarcodeValue(i + 1));
    expect(new Set(values).size).toBe(1000);
  });

  it('continues uniquely when numbering resumes after an offset (append case)', () => {
    const first = Array.from({ length: 10 }, (_, i) => mockBarcodeValue(i + 1));
    const appended = Array.from({ length: 10 }, (_, i) => mockBarcodeValue(10 + i + 1));
    expect(new Set([...first, ...appended]).size).toBe(20);
  });
});

describe('voucher inventory constants', () => {
  it('caps inventory at a sane maximum', () => {
    expect(VOUCHER_INVENTORY_MAX).toBe(10000);
  });

  it('defines the expected kinds and statuses', () => {
    expect(VOUCHER_CODE_KINDS).toEqual(['barcode', 'link']);
    expect(VOUCHER_CODE_STATUSES).toEqual(['available', 'assigned', 'redeemed']);
  });
});

describe('optional link code (VOUCHER_CODE_REGEX)', () => {
  const base = {
    codeId: 'c1', offerId: 'o1', kind: 'link' as const,
    value: 'https://example.com/redeem', status: 'available' as const, createdAt: new Date(),
  };

  it('accepts a unit with no code (code is optional)', () => {
    expect(voucherCodeSchema.safeParse(base).success).toBe(true);
  });

  it('accepts safe codes (alphanumerics + . _ - / : +)', () => {
    for (const code of ['ABC123', 'SAVE-10', 'a.b_c/d:e+f', '0']) {
      expect(voucherCodeSchema.safeParse({ ...base, code }).success).toBe(true);
    }
  });

  it('rejects codes with unsafe characters (no injection/markup/space)', () => {
    for (const code of ['<script>', 'a b', 'a,b', '"x"', "a'b", '$where', 'a;b', 'a&b']) {
      expect(voucherCodeSchema.safeParse({ ...base, code }).success).toBe(false);
    }
  });

  it('rejects an over-length code', () => {
    const tooLong = 'A'.repeat(VOUCHER_CODE_MAX_LENGTH + 1);
    expect(voucherCodeSchema.safeParse({ ...base, code: tooLong }).success).toBe(false);
    expect(VOUCHER_CODE_REGEX.test('A'.repeat(VOUCHER_CODE_MAX_LENGTH))).toBe(true);
  });
});
