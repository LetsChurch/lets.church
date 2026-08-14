import {
  consumeTokenBucketWithFallback,
  createMemoryTokenBucketStore,
  type TokenBucketOptions,
  type TokenBucketResult,
} from '@letschurch/util/rate-limit';
import { describe, expect, it, vi } from 'vitest';

import { answerRateLimitResponse, enforceAnswerRateLimit } from './rate-limit';

const allowedResult: TokenBucketResult = {
  allowed: true,
  remainingTokens: 10,
  retryAfterSeconds: 0,
};

describe('lets.bible answer rate limits', () => {
  it('allows a request after charging hashed IP and resource buckets', async () => {
    const consume = vi.fn(
      async (_options: TokenBucketOptions) => allowedResult,
    );

    await expect(
      enforceAnswerRateLimit(
        {
          headers: new Headers({ 'CF-Connecting-IP': '203.0.113.8' }),
          query: '  What   is Grace? ',
          translation: 'bsb',
          deepen: false,
        },
        consume,
      ),
    ).resolves.toEqual({ allowed: true });

    expect(consume).toHaveBeenCalledTimes(2);
    for (const [options] of consume.mock.calls) {
      expect(options.cost).toBe(2);
      expect(options.key).not.toContain('203.0.113.8');
      expect(options.key).not.toContain('Grace');
    }
  });

  it('rejects an IP before allocating a resource bucket', async () => {
    const consume = vi.fn(async (_options: TokenBucketOptions) => ({
      allowed: false,
      remainingTokens: 0,
      retryAfterSeconds: 17,
    }));

    await expect(
      enforceAnswerRateLimit(
        {
          headers: new Headers({ 'X-Forwarded-For': '198.51.100.4' }),
          query: 'grace',
          translation: 'BSB',
          deepen: false,
        },
        consume,
      ),
    ).resolves.toEqual({
      allowed: false,
      limitedBy: 'ip',
      retryAfterSeconds: 17,
    });
    expect(consume).toHaveBeenCalledOnce();
  });

  it('returns a non-cacheable 429 for a resource rejection', async () => {
    const consume = vi
      .fn<(options: TokenBucketOptions) => Promise<TokenBucketResult | null>>()
      .mockResolvedValueOnce(allowedResult)
      .mockResolvedValueOnce({
        allowed: false,
        remainingTokens: 0,
        retryAfterSeconds: 11,
      });
    const decision = await enforceAnswerRateLimit(
      {
        headers: new Headers({ 'X-Real-IP': '198.51.100.7' }),
        query: 'grace',
        translation: 'BSB',
        deepen: false,
      },
      consume,
    );

    expect(decision).toEqual({
      allowed: false,
      limitedBy: 'resource',
      retryAfterSeconds: 11,
    });
    if (decision.allowed) throw new Error('Expected rejection');
    const response = answerRateLimitResponse(decision);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('11');
    expect(response.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('charges deep requests more than ordinary answers', async () => {
    const consume = vi.fn(
      async (_options: TokenBucketOptions) => allowedResult,
    );

    await enforceAnswerRateLimit(
      {
        headers: new Headers(),
        query: 'grace',
        translation: 'BSB',
        deepen: true,
      },
      consume,
    );

    expect(consume).toHaveBeenCalledOnce();
    expect(consume.mock.calls[0]?.[0].cost).toBe(4);
  });

  it('uses bounded process memory when Valkey is absent', async () => {
    const store = createMemoryTokenBucketStore(2);
    const unavailable = vi.fn(async () => null);
    const options: TokenBucketOptions = {
      key: 'fallback',
      capacity: 2,
      refillTokensPerSecond: 1,
      cost: 2,
    };

    await expect(
      consumeTokenBucketWithFallback(options, unavailable, store),
    ).resolves.toMatchObject({ allowed: true, remainingTokens: 0 });
    await expect(
      consumeTokenBucketWithFallback(
        { ...options, cost: 1 },
        unavailable,
        store,
      ),
    ).resolves.toMatchObject({ allowed: false, retryAfterSeconds: 1 });
  });
});
