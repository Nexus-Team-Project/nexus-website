/**
 * Tests for the member-invite URL routing: a regular member invite (roles
 * exactly ['member']) links straight into the wallet with `?tenant=`; any
 * privileged role keeps the existing website-login-first dashboard flow.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { env } from '../../src/config/env';
import {
  isRegularMemberInvite,
  buildMemberInviteLoginUrl,
  buildMemberInviteWalletUrl,
  buildMemberInviteUrl,
} from '../../src/services/domain-member-invite-email.service';

const ORIGINAL_NODE_ENV = env.NODE_ENV;
const ORIGINAL_WALLET_URL = env.WALLET_URL;

afterEach(() => {
  // The env singleton is mutated directly below (NODE_ENV/WALLET_URL are not
  // re-read from process.env after parsing) - restore so other files never
  // see a leaked 'production' NODE_ENV or WALLET_URL override.
  env.NODE_ENV = ORIGINAL_NODE_ENV;
  env.WALLET_URL = ORIGINAL_WALLET_URL;
});

describe('isRegularMemberInvite', () => {
  it('true only for roles === ["member"]', () => {
    expect(isRegularMemberInvite(['member'])).toBe(true);
  });

  it('false for a privileged role', () => {
    expect(isRegularMemberInvite(['admin'])).toBe(false);
  });

  it('false when member is combined with any other role', () => {
    expect(isRegularMemberInvite(['member', 'admin'])).toBe(false);
  });

  it('false for an empty role list', () => {
    expect(isRegularMemberInvite([])).toBe(false);
  });
});

describe('buildMemberInviteWalletUrl', () => {
  it('builds the language-prefixed wallet root with ?tenant= set, no token', () => {
    const url = buildMemberInviteWalletUrl('tenant_123', 'he');
    expect(url).toContain('/he');
    expect(new URL(url).searchParams.get('tenant')).toBe('tenant_123');
    expect(url).not.toContain('token');
  });

  it('respects the language segment for en', () => {
    const url = buildMemberInviteWalletUrl('tenant_123', 'en');
    expect(new URL(url).pathname).toBe('/en');
  });

  it('follows WALLET_URL when set (any environment)', () => {
    env.WALLET_URL = 'https://wallet.nexus-payment.com';
    const url = buildMemberInviteWalletUrl('tenant_123', 'he');
    expect(new URL(url).host).toBe('wallet.nexus-payment.com');
  });

  it('follows a localhost WALLET_URL in local dev', () => {
    env.WALLET_URL = 'http://localhost:8080';
    const url = buildMemberInviteWalletUrl('tenant_123', 'he');
    expect(new URL(url).host).toBe('localhost:8080');
  });

  it('falls back to the local dev port when WALLET_URL is unset', () => {
    env.WALLET_URL = undefined;
    const url = buildMemberInviteWalletUrl('tenant_123', 'he');
    expect(new URL(url).host).toBe('localhost:8080');
  });
});

describe('buildMemberInviteUrl', () => {
  const TOKEN = 'raw-token-abc';
  const TENANT_ID = 'tenant_123';

  it('regular member invite -> the wallet URL (no token, ?tenant= present)', () => {
    const url = buildMemberInviteUrl({ token: TOKEN, tenantId: TENANT_ID, roles: ['member'], language: 'he' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('tenant')).toBe(TENANT_ID);
    expect(url).not.toContain(TOKEN);
  });

  it('privileged role invite -> the website login URL carrying the token via dashboardRedirect', () => {
    const url = buildMemberInviteUrl({ token: TOKEN, tenantId: TENANT_ID, roles: ['admin'], language: 'he' });
    expect(url).toBe(buildMemberInviteLoginUrl(TOKEN, 'he'));
    const parsed = new URL(url);
    expect(parsed.searchParams.get('dashboardRedirect')).toContain(encodeURIComponent(TOKEN));
  });

  it('member + a privileged role together -> still the website login flow', () => {
    const url = buildMemberInviteUrl({
      token: TOKEN,
      tenantId: TENANT_ID,
      roles: ['member', 'admin'],
      language: 'en',
    });
    expect(url).toBe(buildMemberInviteLoginUrl(TOKEN, 'en'));
  });
});
