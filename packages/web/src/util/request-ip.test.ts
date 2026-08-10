import { describe, expect, it } from 'vitest';

import { getClientIpAddress } from './request-ip';

describe('getClientIpAddress', () => {
  it('prefers Cloudflare client identity over spoofable forwarding headers', () => {
    const headers = new Headers({
      'CF-Connecting-IP': '203.0.113.10',
      'X-Client-IP': '198.51.100.20',
      'X-Forwarded-For': '192.0.2.30, 203.0.113.10',
    });

    expect(getClientIpAddress(headers)).toBe('203.0.113.10');
  });

  it('falls back to the forwarding chain outside Cloudflare', () => {
    const headers = new Headers({
      'X-Forwarded-For': '198.51.100.20, 192.0.2.30',
    });

    expect(getClientIpAddress(headers)).toBe('198.51.100.20');
  });

  it('ignores invalid values', () => {
    expect(
      getClientIpAddress(new Headers({ 'CF-Connecting-IP': 'not-an-ip' })),
    ).toBeNull();
  });
});
