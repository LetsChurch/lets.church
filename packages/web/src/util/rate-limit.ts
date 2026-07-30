import { createHash, createHmac } from 'node:crypto';

import {
  cacheConsumeTokenBucket,
  type TokenBucketOptions,
  type TokenBucketResult,
} from './cache';

export type TokenBucketConsumer = (
  options: TokenBucketOptions,
) => Promise<TokenBucketResult | null>;

type MemoryBucket = { tokens: number; updatedAt: number };

/** A bounded process-local fallback for development and cache outages. */
export function createMemoryTokenBucketStore(maxEntries = 10_000) {
  const buckets = new Map<string, MemoryBucket>();

  return {
    consume(
      { key, capacity, refillTokensPerSecond, cost }: TokenBucketOptions,
      now = Date.now(),
    ): TokenBucketResult {
      const previous = buckets.get(key);
      const elapsedSeconds = previous
        ? Math.max(0, now - previous.updatedAt) / 1000
        : 0;
      const available = Math.min(
        capacity,
        (previous?.tokens ?? capacity) + elapsedSeconds * refillTokensPerSecond,
      );
      const allowed = available >= cost;
      const remainingTokens = allowed ? available - cost : available;

      buckets.delete(key);
      if (!previous && buckets.size >= maxEntries) {
        const oldestKey = buckets.keys().next().value;
        if (typeof oldestKey === 'string') buckets.delete(oldestKey);
      }
      buckets.set(key, { tokens: remainingTokens, updatedAt: now });

      return {
        allowed,
        remainingTokens,
        retryAfterSeconds: allowed
          ? 0
          : Math.max(
              1,
              Math.ceil((cost - remainingTokens) / refillTokensPerSecond),
            ),
      };
    },
  };
}

const memoryStore = createMemoryTokenBucketStore();

export function rateLimitIdentifier(value: string): string {
  const secret = process.env.JWT_SECRET;
  const digest = secret
    ? createHmac('sha256', secret).update('rate-limit:v1\0').update(value)
    : createHash('sha256').update('rate-limit:v1\0').update(value);
  return digest.digest('base64url').slice(0, 24);
}

export async function consumeTokenBucketWithFallback(
  options: TokenBucketOptions,
  consume: TokenBucketConsumer = cacheConsumeTokenBucket,
): Promise<TokenBucketResult> {
  return (await consume(options)) ?? memoryStore.consume(options);
}
