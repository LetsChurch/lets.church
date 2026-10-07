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
  it('gives a verified subject its own bucket under a shared IP ceiling', async () => {
    const consume = vi.fn(async (_options: TokenBucketOptions) => ({
      allowed: true,
      remainingTokens: 10,
      retryAfterSeconds: 0,
    }));

    await enforceSearchRateLimit(
      {
        headers: new Headers({ 'CF-Connecting-IP': '203.0.113.9' }),
        kind: 'search',
        subject: { key: 'mcp-session:abc', sharedIpMultiplier: 25 },
      },
      consume,
    );

    expect(consume).toHaveBeenCalledTimes(2);
    const [ceiling, subject] = consume.mock.calls.map(([options]) => options);
    // The ceiling is a different key from the plain per-IP bucket, so web and
    // MCP traffic from one address don't share a capacity.
    expect(ceiling?.key).toContain(':shared-ip:');
    expect(ceiling).toMatchObject({
      capacity: 20 * 25,
      refillTokensPerSecond: (1 / 2) * 25,
    });
    expect(subject?.key).toContain(':subject:');
    expect(subject?.key).not.toContain('abc');
    expect(subject).toMatchObject({
      capacity: 20,
      refillTokensPerSecond: 1 / 2,
    });
  });

  it('stops at the shared ceiling before touching the subject bucket', async () => {
    const consume = vi.fn(async (_options: TokenBucketOptions) => ({
      allowed: false,
      remainingTokens: 0,
      retryAfterSeconds: 3,
    }));

    await expect(
      enforceSearchRateLimit(
        {
          headers: new Headers({ 'CF-Connecting-IP': '203.0.113.9' }),
          kind: 'search',
          subject: { key: 'mcp-session:abc', sharedIpMultiplier: 25 },
        },
        consume,
      ),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 3 });
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it('limits a subject even without a trustworthy client IP', async () => {
    const consume = vi.fn(async (_options: TokenBucketOptions) => ({
      allowed: true,
      remainingTokens: 10,
      retryAfterSeconds: 0,
    }));

    await enforceSearchRateLimit(
      {
        headers: new Headers(),
        kind: 'search',
        subject: { key: 'mcp-session:abc', sharedIpMultiplier: 25 },
      },
      consume,
    );
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]?.[0].key).toContain(':subject:');
  });
});
