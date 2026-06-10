/**
 * Tests for the InforU low-level SMS client. Mocks global.fetch so no real SMS
 * is sent. Spec: inforu-sms-api.md section 4 (POST /api/v2/SMS/SendSms).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const okSend = { StatusId: 1, StatusDescription: 'OK' };
const fail = { StatusId: 99, StatusDescription: 'bad' };

function mockFetchOnce(json: unknown, status = 200): void {
  // @ts-expect-error - assigning a Vitest mock to the global fetch
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status < 400,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.INFORU_USER = 'test-user';
  process.env.INFORU_TOKEN = 'test-token';
  process.env.INFORU_BASE_URL = 'https://capi.inforu.co.il';
  process.env.INFORU_SENDER = 'Nexus';
});

describe('inforuSendSms', () => {
  it('resolves on StatusId=1', async () => {
    const { inforuSendSms } = await import('../../../src/services/sms/inforu.client');
    mockFetchOnce(okSend);
    await expect(
      inforuSendSms({ phone: '0508465858', message: 'code 123456' }),
    ).resolves.toBeUndefined();
  });

  it('throws inforu_send_status_<N> on a non-1 StatusId', async () => {
    const { inforuSendSms } = await import('../../../src/services/sms/inforu.client');
    mockFetchOnce(fail);
    await expect(
      inforuSendSms({ phone: '0508465858', message: 'x' }),
    ).rejects.toThrow(/inforu_send_status_99/);
  });

  it('throws inforu_http_<status> on non-2xx HTTP', async () => {
    const { inforuSendSms } = await import('../../../src/services/sms/inforu.client');
    mockFetchOnce({}, 500);
    await expect(
      inforuSendSms({ phone: '0508465858', message: 'x' }),
    ).rejects.toThrow(/inforu_http_500/);
  });

  it('calls the SendSms endpoint with Basic auth', async () => {
    const { inforuSendSms } = await import('../../../src/services/sms/inforu.client');
    mockFetchOnce(okSend);
    await inforuSendSms({ phone: '0508465858', message: 'hello' });
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call[0])).toContain('/api/v2/SMS/SendSms');
    expect((call[1] as { headers: Record<string, string> }).headers.Authorization).toMatch(/^Basic /);
  });
});
