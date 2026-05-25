/**
 * Tests for the wallet session-issuer helper. Verifies the refresh
 * cookie is set with the correct flags and that an access token is
 * returned. The underlying issueTokens() is mocked to avoid hitting
 * Prisma in unit tests.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 6
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';

vi.mock('../../../src/services/auth.service', () => ({
  issueTokens: vi.fn().mockResolvedValue({
    accessToken: 'fake-access-token',
    rawRefreshToken: 'fake-raw-refresh',
    userId: 'user-1',
  }),
}));

import { issueWalletSession } from '../../../src/services/auth/session-issuer.service';

describe('issueWalletSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an access token and sets the refresh cookie', async () => {
    const cookieMock = vi.fn();
    const res = { cookie: cookieMock } as unknown as Response;
    const out = await issueWalletSession(res, {
      userId: 'user-1',
      email: 'a@b.com',
      role: 'USER',
    });
    expect(out.accessToken).toBe('fake-access-token');
    expect(cookieMock).toHaveBeenCalledTimes(1);
    const [cookieName, cookieValue, cookieOpts] = cookieMock.mock.calls[0];
    expect(cookieName).toBe('nexus_refresh');
    expect(cookieValue).toBe('fake-raw-refresh');
    expect(cookieOpts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });

  it('forwards ip + userAgent to issueTokens', async () => {
    const { issueTokens } = await import('../../../src/services/auth.service');
    const cookieMock = vi.fn();
    const res = { cookie: cookieMock } as unknown as Response;
    await issueWalletSession(res, {
      userId: 'user-1',
      email: 'a@b.com',
      role: 'USER',
      ip: '1.2.3.4',
      userAgent: 'wallet/1.0',
    });
    expect(issueTokens).toHaveBeenCalledWith(
      'user-1',
      'a@b.com',
      'USER',
      { userAgent: 'wallet/1.0', ipAddress: '1.2.3.4' },
    );
  });
});
