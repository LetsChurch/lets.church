import { describe, expect, it, vi } from 'vitest';

import type { TokenBucketOptions } from '@/util/cache';

import {
  enforcePublicActionRateLimit,
  publicActionRateLimitResponse,
} from './public-action-rate-limit';

describe('public action abuse controls', () => {
  it('limits by hashed IP and normalized email without exposing either', async () => {
    const consume = vi.fn(async (_options: TokenBucketOptions) => ({
      allowed: true,
      remainingTokens: 2,
      retryAfterSeconds: 0,
    }));

    await expect(
      enforcePublicActionRateLimit(
        {
          headers: new Headers({ 'X-Real-IP': '198.51.100.4' }),
          email: ' Donor@Example.com ',
          kind: 'donation-checkout',
        },
        consume,
      ),
    ).resolves.toEqual({ allowed: true });

    expect(consume).toHaveBeenCalledTimes(2);
    for (const [options] of consume.mock.calls) {
      expect(options.key).not.toContain('198.51.100.4');
      expect(options.key).not.toContain('donor@example.com');
    }

    const firstEmailKey = consume.mock.calls[1][0].key;
    consume.mockClear();
    await enforcePublicActionRateLimit(
      {
        headers: new Headers(),
        email: 'donor@example.com',
        kind: 'donation-checkout',
      },
      consume,
    );
    expect(consume.mock.calls[0][0].key).toBe(firstEmailKey);
  });

  it('stops after a denied IP bucket', async () => {
    const consume = vi.fn(async (_options: TokenBucketOptions) => ({
      allowed: false,
      remainingTokens: 0,
      retryAfterSeconds: 30,
    }));

    await expect(
      enforcePublicActionRateLimit(
        {
          headers: new Headers({ 'X-Forwarded-For': '203.0.113.9' }),
          email: 'donor@example.com',
          kind: 'email-sign-in',
        },
        consume,
      ),
    ).resolves.toEqual({
      allowed: false,
      limitedBy: 'ip',
      retryAfterSeconds: 30,
    });
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it('returns a generic, non-cacheable public response', async () => {
    const response = publicActionRateLimitResponse({
      allowed: false,
      limitedBy: 'email',
      retryAfterSeconds: 60,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('60');
    await expect(response.json()).resolves.toEqual({
      error: 'Too many requests. Wait a few minutes and try again.',
    });
  });
});
