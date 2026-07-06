/**
 * Tests for the OTP SMS builder + origin-bound host derivation.
 *
 * The origin-bound `@host #code` line is what enables Android WebOTP and iOS
 * Safari one-time-code autofill, so its exact shape (last line, host = WALLET_URL
 * hostname) is contract, not cosmetics - these tests pin it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { boundOtpHost, buildOtpSms } from '../../../src/services/auth/otp-sms.helper';

const ORIGINAL = process.env.WALLET_URL;

afterEach(() => {
  // Restore whatever the env had so tests do not leak WALLET_URL into each other.
  if (ORIGINAL === undefined) delete process.env.WALLET_URL;
  else process.env.WALLET_URL = ORIGINAL;
});

describe('boundOtpHost', () => {
  it('returns the bare hostname from WALLET_URL', () => {
    process.env.WALLET_URL = 'https://wallet.nexus-payment.com';
    expect(boundOtpHost()).toBe('wallet.nexus-payment.com');
  });

  it('strips port and path, keeping only the host', () => {
    process.env.WALLET_URL = 'http://localhost:8080/he/store';
    expect(boundOtpHost()).toBe('localhost');
  });

  it('returns null when WALLET_URL is unset', () => {
    delete process.env.WALLET_URL;
    expect(boundOtpHost()).toBeNull();
  });

  it('returns null (does not throw) on a malformed WALLET_URL', () => {
    process.env.WALLET_URL = 'not a url';
    expect(boundOtpHost()).toBeNull();
  });
});

describe('buildOtpSms', () => {
  it('carries the code and the do-not-share warning', () => {
    process.env.WALLET_URL = 'https://wallet.nexus-payment.com';
    const sms = buildOtpSms('123456');
    expect(sms).toContain('123456');
    expect(sms).toContain('אין לשתף');
  });

  it('appends the origin-bound line as the LAST line when a host is configured', () => {
    process.env.WALLET_URL = 'https://wallet.nexus-payment.com';
    const sms = buildOtpSms('123456');
    const lines = sms.split('\n');
    expect(lines[lines.length - 1]).toBe('@wallet.nexus-payment.com #123456');
  });

  it('omits the origin-bound line when WALLET_URL is unset', () => {
    delete process.env.WALLET_URL;
    const sms = buildOtpSms('123456');
    expect(sms).not.toContain('@');
    expect(sms).not.toContain('#123456');
  });
});

describe('buildOtpSms host override', () => {
  it('uses the given host when a string override is passed (ignores WALLET_URL)', () => {
    process.env.WALLET_URL = 'https://wallet.example.com';
    const sms = buildOtpSms('123456', 'dashboard.example.com');
    const lines = sms.split('\n');
    expect(lines[lines.length - 1]).toBe('@dashboard.example.com #123456');
  });

  it('omits the origin line when the override is null even if WALLET_URL is set', () => {
    process.env.WALLET_URL = 'https://wallet.example.com';
    const sms = buildOtpSms('123456', null);
    expect(sms).toContain('123456');
    expect(sms).not.toContain('@');
  });
});
