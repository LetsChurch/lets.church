import { describe, expect, it, vi } from 'vitest';

import type { TokenBucketOptions } from '@/util/cache';

import {
  aiRateLimitResponse,
  createMemoryTokenBucketStore,
  enforceAiRateLimit,
} from './abuse-control';

describe('AI abuse controls', () => {
  it('charges deep requests against IP and resource buckets without exposing identifiers', async () => {
    const consume = vi.fn(async (_options: TokenBucketOptions) => ({
      allowed: true,
      remainingTokens: 10,
      retryAfterSeconds: 0,
    }));

    await expect(
      enforceAiRateLimit(
        {
          headers: new Headers({ 'X-Forwarded-For': '203.0.113.9' }),
          resourceId: 'browser-resource-id',
          kind: 'dig-deeper',
        },
        consume,
      ),
    ).resolves.toEqual({ allowed: true });

    expect(consume).toHaveBeenCalledTimes(2);
    for (const [options] of consume.mock.calls) {
      expect(options.cost).toBe(4);
      expect(options.key).not.toContain('203.0.113.9');
      expect(options.key).not.toContain('browser-resource-id');
    }
  });

  it('stops at a denied IP bucket before allocating a resource bucket', async () => {
    const consume = vi.fn(async (_options: TokenBucketOptions) => ({
      allowed: false,
      remainingTokens: 0,
      retryAfterSeconds: 17,
    }));

    await expect(
      enforceAiRateLimit(
        {
          headers: new Headers({ 'X-Real-IP': '198.51.100.4' }),
          resourceId: 'rotated-id',
          kind: 'search',
        },
        consume,
      ),
    ).resolves.toEqual({
      allowed: false,
      limitedBy: 'ip',
      retryAfterSeconds: 17,
    });
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it('refills the process-local fallback over time', () => {
    const store = createMemoryTokenBucketStore();
    const options = {
      key: 'test',
      capacity: 4,
      refillTokensPerSecond: 1,
      cost: 4,
    };

    expect(store.consume(options, 0)).toMatchObject({
      allowed: true,
      remainingTokens: 0,
    });
    expect(store.consume({ ...options, cost: 1 }, 0)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(store.consume({ ...options, cost: 1 }, 1_000)).toMatchObject({
      allowed: true,
      remainingTokens: 0,
    });
  });

  it('returns a non-cacheable 429 with retry guidance', () => {
    const response = aiRateLimitResponse({
      allowed: false,
      limitedBy: 'resource',
      retryAfterSeconds: 12,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
