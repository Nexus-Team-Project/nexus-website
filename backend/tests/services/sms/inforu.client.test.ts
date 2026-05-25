/**
 * Tests for the InforU low-level HTTP client. Mocks global.fetch so no
 * real SMS is sent. Spec: inforu-sms-api.md sections 2 and 3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const okSend = { StatusId: 1, RequestToken: 'tok-abc', StatusDescription: 'OK' };
const okAuth = { StatusId: 1, StatusDescription: 'OK' };
const fail = { StatusId: 99, StatusDescription: 'bad' };

function mockFetchOnce(json: unknown, status = 200): void {
  // @ts-expect-error - assigning a Vitest mock to the global fetch
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status < 400,
    status,
    json: async () => json,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.INFORU_USER = 'test-user';
  process.env.INFORU_TOKEN = 'test-token';
  process.env.INFORU_BASE_URL = 'https://capi.inforu.co.il';
});

describe('inforuSendOtp', () => {
  it('returns the request token on StatusId=1', async () => {
    const { inforuSendOtp } = await import('../../../src/services/sms/inforu.client');
    mockFetchOnce(okSend);
    const out = await inforuSendOtp({ phone: '0508465858', userIp: '1.2.3.4' });
    expect(out.requestToken).toBe('tok-abc');
  });

  it('throws on non-1 StatusId', async () => {
    const { inforuSendOtp } = await import('../../../src/services/sms/inforu.client');
    mockFetchOnce(fail);
    await expect(inforuSendOtp({ phone: '0508465858' })).rejects.toThrow(/inforu_send_status_99/);
  });

  it('throws on non-2xx HTTP', async () => {
    const { inforuSendOtp } = await import('../../../src/services/sms/inforu.client');
    mockFetchOnce({}, 500);
    await expect(inforuSendOtp({ phone: '0508465858' })).rejects.toThrow(/inforu_http_500/);
  });
});

describe('inforuAuthenticateOtp', () => {
  it('returns ok=true on StatusId=1', async () => {
    const { inforuAuthenticateOtp } = await import('../../../src/services/sms/inforu.client');
    mockFetchOnce(okAuth);
    const r = await inforuAuthenticateOtp({
      phone: '0508465858',
      code: '123456',
      requestToken: 'tok-abc',
    });
    expect(r.ok).toBe(true);
  });

  it('returns ok=false on any other status', async () => {
    const { inforuAuthenticateOtp } = await import('../../../src/services/sms/inforu.client');
    mockFetchOnce(fail);
    const r = await inforuAuthenticateOtp({
      phone: '0508465858',
      code: '000000',
      requestToken: 'tok-abc',
    });
    expect(r.ok).toBe(false);
  });
});
