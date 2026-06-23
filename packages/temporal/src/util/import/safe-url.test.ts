import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPublicUrl, safeFetch, UnsafeUrlError } from './safe-url';

describe('assertPublicUrl', () => {
  describe('scheme restriction', () => {
    it.each([
      'ftp://example.com',
      'file:///etc/passwd',
      'gopher://x',
      'data:text/html,x',
    ])('rejects non-http(s) scheme %s', async (url) => {
      await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    });

    it('rejects an unparseable URL', async () => {
      await expect(assertPublicUrl('http://[bad')).rejects.toBeInstanceOf(
        UnsafeUrlError,
      );
    });
  });

  describe('blocked IP literals', () => {
    it.each([
      'http://127.0.0.1/',
      'http://10.0.0.1/',
      'http://172.16.5.5/',
      'http://192.168.1.1/',
      'http://169.254.169.254/', // cloud metadata
      'http://100.64.0.1/', // CGNAT
      'http://0.0.0.0/',
      'http://[::1]/', // IPv6 loopback
      'http://[fe80::1]/', // IPv6 link-local
      'http://[fc00::1]/', // IPv6 ULA
      'http://[::ffff:127.0.0.1]/', // IPv4-mapped IPv6 (dotted)
      'http://[::ffff:7f00:1]/', // IPv4-mapped IPv6 (hex)
      'http://[::127.0.0.1]/', // IPv4-compatible IPv6 -> canonicalizes to ::7f00:1
      'http://[::7f00:1]/', // IPv4-compatible IPv6 (bare hex)
    ])('blocks %s', async (url) => {
      await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    });

    it.each([
      ['decimal', 'http://2130706433/'], // 127.0.0.1
      ['hex', 'http://0x7f000001/'], // 127.0.0.1
      ['octal', 'http://0177.0.0.1/'], // 127.0.0.1
      ['short form', 'http://127.1/'], // 127.0.0.1
    ])('blocks alternate IPv4 encoding (%s)', async (_label, url) => {
      // The WHATWG URL parser canonicalizes these to dotted-decimal before we
      // read the hostname, so the blocklist still catches them.
      await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    });

    it('blocks localhost (resolves to loopback via the hosts file)', async () => {
      await expect(assertPublicUrl('http://localhost/')).rejects.toBeInstanceOf(
        UnsafeUrlError,
      );
    });
  });

  describe('allowed targets', () => {
    it('returns the parsed URL for a public IP literal', async () => {
      const url = await assertPublicUrl('https://8.8.8.8/path');
      expect(url).toBeInstanceOf(URL);
      expect(url.hostname).toBe('8.8.8.8');
    });

    it('allows a public IP just outside a blocked range', async () => {
      // 172.32.0.1 is outside 172.16.0.0/12; 11.0.0.1 is outside 10.0.0.0/8.
      await expect(
        assertPublicUrl('http://172.32.0.1/'),
      ).resolves.toBeInstanceOf(URL);
      await expect(assertPublicUrl('http://11.0.0.1/')).resolves.toBeInstanceOf(
        URL,
      );
    });
  });
});

describe('safeFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('revalidates redirect targets and blocks redirect-to-internal', async () => {
    // First hop is a public literal (passes assertPublicUrl with no DNS); the
    // server then 302s to an internal address, which must be rejected.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'http://169.254.169.254/latest/meta-data/' },
          }),
      ),
    );

    await expect(safeFetch('http://93.184.216.34/')).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it('returns the response for a non-redirect success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 })),
    );

    const res = await safeFetch('http://93.184.216.34/');
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe('ok');
  });

  it('rejects a disallowed scheme before fetching', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(safeFetch('file:///etc/passwd')).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects up front when Content-Length exceeds maxBytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('x'.repeat(100), {
            status: 200,
            headers: { 'content-length': '100' },
          }),
      ),
    );

    await expect(
      safeFetch('http://93.184.216.34/', {}, { maxBytes: 10 }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('errors the stream when the body exceeds maxBytes', async () => {
    // No Content-Length header, so the cap is enforced while streaming.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('x'.repeat(100)));
            controller.close();
          },
        });
        return new Response(body, { status: 200 });
      }),
    );

    const res = await safeFetch('http://93.184.216.34/', {}, { maxBytes: 10 });
    await expect(res.text()).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('returns the full body when under maxBytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('small', { status: 200 })),
    );

    const res = await safeFetch(
      'http://93.184.216.34/',
      {},
      { maxBytes: 1000 },
    );
    await expect(res.text()).resolves.toBe('small');
  });
});
