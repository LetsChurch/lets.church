import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HCAPTCHA_SITE_KEY = '10000000-ffff-ffff-ffff-000000000001';
const HCAPTCHA_SECRET_KEY = '0x0000000000000000000000000000000000000000';

describe('validateHCaptcha', () => {
  beforeEach(() => {
    vi.stubEnv('HCAPTCHA_SITE_KEY', HCAPTCHA_SITE_KEY);
    vi.stubEnv('HCAPTCHA_SECRET_KEY', HCAPTCHA_SECRET_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('submits a URL-encoded verification request with the expected site key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { validateHCaptcha } = await import('./hcaptcha');

    await expect(validateHCaptcha('response-token', '192.0.2.1')).resolves.toBe(
      true,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.hcaptcha.com/siteverify');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      secret: HCAPTCHA_SECRET_KEY,
      response: 'response-token',
      sitekey: HCAPTCHA_SITE_KEY,
      remoteip: '192.0.2.1',
    });
  });

  it('returns false when hCaptcha rejects the token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const { validateHCaptcha } = await import('./hcaptcha');

    await expect(validateHCaptcha('invalid-token')).resolves.toBe(false);
  });
});
