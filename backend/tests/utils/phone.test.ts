/**
 * Tests for Israeli mobile phone normalization + hash helper.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 10.1
 */
import { describe, it, expect } from 'vitest';
import { normalizeIsraeliPhone, hashPhone } from '../../src/utils/phone';

describe('normalizeIsraeliPhone', () => {
  it.each([
    ['0508465858', '0508465858'],
    ['+972508465858', '0508465858'],
    ['972508465858', '0508465858'],
    ['00972508465858', '0508465858'],
    ['+972 50-846-5858', '0508465858'],
    [' 050-846-5858 ', '0508465858'],
    ['508465858', '0508465858'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeIsraeliPhone(input)).toBe(expected);
  });

  it.each([
    '',
    '0512345',
    '04081234567',
    'abcdefghij',
    '+12025550100',
  ])('rejects %s', (input) => {
    expect(() => normalizeIsraeliPhone(input)).toThrow('invalid_phone');
  });
});

describe('hashPhone', () => {
  it('returns a 64-char hex SHA-256', () => {
    expect(hashPhone('0508465858')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashPhone('0508465858')).toBe(hashPhone('0508465858'));
  });
});
