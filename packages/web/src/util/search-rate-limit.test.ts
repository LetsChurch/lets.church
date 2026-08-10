import { describe, expect, it, vi } from 'vitest';

import type { TokenBucketOptions } from '@/util/cache';

import { enforceSearchRateLimit } from './search-rate-limit';

describe('search rate limit', () => {
  it('uses a hashed IP key and charges deep searches twice', async () => {
    const consume = vi.fn(async (_options: TokenBucketOptions) => ({
      allowed: true,
      remainingTokens: 10,
      retryAfterSeconds: 0,
    }));

    await expect(
      enforceSearchRateLimit(
        {
          headers: new Headers({ 'CF-Connecting-IP': '203.0.113.9' }),
          kind: 'search-deep',
        },
        consume,
      ),
    ).resolves.toEqual({ allowed: true });

    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]?.[0]).toMatchObject({
      capacity: 20,
      refillTokensPerSecond: 1 / 2,
      cost: 2,
    });
    expect(consume.mock.calls[0]?.[0].key).not.toContain('203.0.113.9');
  });

  it('returns retry guidance when the IP bucket is empty', async () => {
    const consume = vi.fn(async (_options: TokenBucketOptions) => ({
      allowed: false,
      remainingTokens: 0,
      retryAfterSeconds: 2,
    }));

    await expect(
      enforceSearchRateLimit(
        {
          headers: new Headers({ 'X-Forwarded-For': '198.51.100.4' }),
          kind: 'search',
        },
        consume,
      ),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 2 });
  });

  it('allows requests without a trustworthy client IP', async () => {
    const consume = vi.fn();

    await expect(
      enforceSearchRateLimit(
        { headers: new Headers(), kind: 'search' },
        consume,
      ),
    ).resolves.toEqual({ allowed: true });
    expect(consume).not.toHaveBeenCalled();
  });

  it('fails open when Valkey is unavailable', async () => {
    const consume = vi.fn(async () => null);

    await expect(
      enforceSearchRateLimit(
        {
          headers: new Headers({ 'CF-Connecting-IP': '203.0.113.9' }),
          kind: 'search',
        },
        consume,
      ),
    ).resolves.toEqual({ allowed: true });
    expect(consume).toHaveBeenCalledTimes(1);
  });
});
