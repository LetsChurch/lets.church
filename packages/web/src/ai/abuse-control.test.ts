import { describe, expect, it, vi } from 'vitest';

import type { TokenBucketOptions, TokenBucketResult } from '@/util/cache';

import {
  aiRateLimitResponse,
  createMemoryTokenBucketStore,
  enforceAiRateLimit,
} from './abuse-control';

describe('AI abuse controls', () => {
  it.each([
    ['search-embed', 1],
    ['search-warm-embed', 1],
    ['search-suggest', 2],
    ['search-meta', 4],
  ] as const)(
    'charges %s against IP then resource buckets with hashed identifiers',
    async (kind, expectedCost) => {
      const consume = vi.fn(async (_options: TokenBucketOptions) => ({
        allowed: true,
        remainingTokens: 10,
        retryAfterSeconds: 0,
      }));

      await expect(
        enforceAiRateLimit(
          {
            headers: new Headers({ 'X-Forwarded-For': '203.0.113.9' }),
            resourceId: 'normalized-search-resource',
            kind,
          },
          consume,
        ),
      ).resolves.toEqual({ allowed: true });

      expect(consume).toHaveBeenCalledTimes(2);
      const [ipOptions] = consume.mock.calls[0];
      const [resourceOptions] = consume.mock.calls[1];
      expect(ipOptions).toMatchObject({
        cost: expectedCost,
        capacity: 20,
        refillTokensPerSecond: 1 / 8,
      });
      expect(ipOptions.key).toMatch(/^ai-rate:v1:ip:/);
      expect(resourceOptions).toMatchObject({
        cost: expectedCost,
        capacity: 16,
        refillTokensPerSecond: 1 / 10,
      });
      expect(resourceOptions.key).toMatch(/^ai-rate:v1:resource:/);
      for (const options of [ipOptions, resourceOptions]) {
        expect(options.key).not.toContain('203.0.113.9');
        expect(options.key).not.toContain('normalized-search-resource');
      }
    },
  );

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

  it('reports a denied resource bucket after an allowed IP bucket', async () => {
    const consume = vi
      .fn<(options: TokenBucketOptions) => Promise<TokenBucketResult | null>>()
      .mockResolvedValueOnce({
        allowed: true,
        remainingTokens: 9,
        retryAfterSeconds: 0,
      })
      .mockResolvedValueOnce({
        allowed: false,
        remainingTokens: 0,
        retryAfterSeconds: 23,
      });

    await expect(
      enforceAiRateLimit(
        {
          headers: new Headers({ 'X-Real-IP': '198.51.100.8' }),
          resourceId: 'shared-query',
          kind: 'search-suggest',
        },
        consume,
      ),
    ).resolves.toEqual({
      allowed: false,
      limitedBy: 'resource',
      retryAfterSeconds: 23,
    });
    expect(consume).toHaveBeenCalledTimes(2);
  });

  it('uses the resource bucket when no client IP is available', async () => {
    const consume = vi.fn(async (_options: TokenBucketOptions) => ({
      allowed: true,
      remainingTokens: 10,
      retryAfterSeconds: 0,
    }));

    await expect(
      enforceAiRateLimit(
        {
          headers: new Headers(),
          resourceId: 'missing-ip-query',
          kind: 'search-warm-embed',
        },
        consume,
      ),
    ).resolves.toEqual({ allowed: true });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0][0].key).toMatch(/^ai-rate:v1:resource:/);
  });

  it('falls back to the bounded local store when shared consumption is unavailable', async () => {
    const unavailable = vi.fn(async () => null);

    await expect(
      enforceAiRateLimit(
        {
          headers: new Headers(),
          resourceId: `fallback-${crypto.randomUUID()}`,
          kind: 'search-meta',
        },
        unavailable,
      ),
    ).resolves.toEqual({ allowed: true });
    expect(unavailable).toHaveBeenCalledTimes(1);
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
