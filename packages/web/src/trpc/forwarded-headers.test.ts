import { describe, expect, it } from 'vitest';

import { getForwardedTrpcHeaders } from './forwarded-headers';

describe('getForwardedTrpcHeaders', () => {
  it('preserves cookies and canonicalizes the Cloudflare visitor IP for SSR', () => {
    const forwarded = getForwardedTrpcHeaders(
      new Headers({
        cookie: 'session=abc',
        'CF-Connecting-IP': '203.0.113.10',
        'X-Client-IP': '198.51.100.20',
      }),
    );

    expect(forwarded).toEqual({
      cookie: 'session=abc',
      'CF-Connecting-IP': '203.0.113.10',
    });
  });

  it('does not invent identity headers when none are available', () => {
    expect(getForwardedTrpcHeaders(new Headers())).toEqual({});
  });
});
