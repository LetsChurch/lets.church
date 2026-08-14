import { describe, expect, it, vi } from 'vitest';

import type { TokenBucketOptions } from '@/util/cache';
import { rateLimitIdentifier } from '@/util/rate-limit';

import {
  enforceDonationStatusRateLimit,
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

  it('checks hashed donation status IP and session buckets in order', async () => {
    const consume = vi.fn(async (_options: TokenBucketOptions) => ({
      allowed: true,
      remainingTokens: 1,
      retryAfterSeconds: 0,
    }));

    await expect(
      enforceDonationStatusRateLimit(
        {
          headers: new Headers({ 'X-Real-IP': '198.51.100.19' }),
          sessionId: 'cs_status_secret',
        },
        consume,
      ),
    ).resolves.toEqual({ allowed: true });

    expect(consume).toHaveBeenCalledTimes(2);
    expect(consume.mock.calls[0][0]).toEqual({
      key: `public-action-rate:v1:donation-status:ip:${rateLimitIdentifier(
        '198.51.100.19',
      )}`,
      capacity: 30,
      refillTokensPerSecond: 1 / 2,
      cost: 1,
    });
    expect(consume.mock.calls[1][0]).toEqual({
      key: `public-action-rate:v1:donation-status:session:${rateLimitIdentifier(
        'cs_status_secret',
      )}`,
      capacity: 1,
      refillTokensPerSecond: 1 / 10,
      cost: 1,
    });
    for (const [options] of consume.mock.calls) {
      expect(options.key).not.toContain('198.51.100.19');
      expect(options.key).not.toContain('cs_status_secret');
      expect(options.key).not.toContain(':email:');
    }
  });

  it('returns the bucket scope and stops after a donation status denial', async () => {
    const denied = {
      allowed: false,
      remainingTokens: 0,
      retryAfterSeconds: 4,
    };
    const consumeIp = vi.fn(async (_options: TokenBucketOptions) => denied);

    await expect(
      enforceDonationStatusRateLimit(
        {
          headers: new Headers({ 'X-Forwarded-For': '203.0.113.21' }),
          sessionId: 'cs_ip_denied',
        },
        consumeIp,
      ),
    ).resolves.toEqual({
      allowed: false,
      limitedBy: 'ip',
      retryAfterSeconds: 4,
    });
    expect(consumeIp).toHaveBeenCalledTimes(1);

    const consumeSession = vi
      .fn<(options: TokenBucketOptions) => Promise<typeof denied>>()
      .mockResolvedValueOnce({
        allowed: true,
        remainingTokens: 20,
        retryAfterSeconds: 0,
      })
      .mockResolvedValueOnce(denied);
    await expect(
      enforceDonationStatusRateLimit(
        {
          headers: new Headers({ 'X-Real-IP': '203.0.113.22' }),
          sessionId: 'cs_session_denied',
        },
        consumeSession,
      ),
    ).resolves.toEqual({
      allowed: false,
      limitedBy: 'session',
      retryAfterSeconds: 4,
    });
  });

  it('shares the IP ceiling across donation checkout sessions', async () => {
    const ipKey = `public-action-rate:v1:donation-status:ip:${rateLimitIdentifier(
      '198.51.100.27',
    )}`;
    let ipCharges = 0;
    const consume = vi.fn(async (options: TokenBucketOptions) => {
      if (options.key === ipKey) {
        ipCharges += 1;
        if (ipCharges > 1) {
          return {
            allowed: false,
            remainingTokens: 0,
            retryAfterSeconds: 2,
          };
        }
      }
      return {
        allowed: true,
        remainingTokens: 1,
        retryAfterSeconds: 0,
      };
    });
    const headers = new Headers({ 'X-Real-IP': '198.51.100.27' });

    await expect(
      enforceDonationStatusRateLimit(
        { headers, sessionId: 'cs_first_session' },
        consume,
      ),
    ).resolves.toEqual({ allowed: true });
    await expect(
      enforceDonationStatusRateLimit(
        { headers, sessionId: 'cs_second_session' },
        consume,
      ),
    ).resolves.toEqual({
      allowed: false,
      limitedBy: 'ip',
      retryAfterSeconds: 2,
    });
    expect(consume.mock.calls.map(([options]) => options.key)).toEqual([
      ipKey,
      `public-action-rate:v1:donation-status:session:${rateLimitIdentifier(
        'cs_first_session',
      )}`,
      ipKey,
    ]);
  });

  it('uses bounded fallback admission when shared token consumption fails', async () => {
    const unavailable = vi.fn(async (_options: TokenBucketOptions) => null);
    const input = {
      headers: new Headers(),
      sessionId: 'cs_fallback_status_026',
    };

    await expect(
      enforceDonationStatusRateLimit(input, unavailable),
    ).resolves.toEqual({ allowed: true });
    await expect(
      enforceDonationStatusRateLimit(input, unavailable),
    ).resolves.toEqual({
      allowed: false,
      limitedBy: 'session',
      retryAfterSeconds: 10,
    });
    expect(unavailable).toHaveBeenCalledTimes(2);
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
