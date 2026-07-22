import { createHash } from 'node:crypto';

import {
  cacheConsumeTokenBucket,
  type TokenBucketOptions,
  type TokenBucketResult,
} from '@/util/cache';
import { getClientIpAddress } from '@/util/request-ip';

export type AiRequestKind = 'dig-deeper' | 'search' | 'search-deep';

type BucketScope = 'ip' | 'resource';
type BucketConsumer = (
  options: TokenBucketOptions,
) => Promise<TokenBucketResult | null>;

export type AiRateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      limitedBy: BucketScope;
      retryAfterSeconds: number;
    };

// Credits let both endpoints share one budget while charging the multi-tool
// detective paths more heavily than a normal Search Overview generation.
const REQUEST_COST: Record<AiRequestKind, number> = {
  search: 2,
  'search-deep': 4,
  'dig-deeper': 4,
};

const IP_BUCKET = {
  capacity: 20,
  refillTokensPerSecond: 1 / 8,
};
const RESOURCE_BUCKET = {
  capacity: 16,
  refillTokensPerSecond: 1 / 10,
};

type MemoryBucket = { tokens: number; updatedAt: number };

/** A bounded process-local fallback for development and Valkey outages. */
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

      // Refresh insertion order so the bounded map evicts the least-recently
      // touched bucket rather than growing from caller-controlled identifiers.
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

function identifierHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 24);
}

async function consumeWithFallback(
  options: TokenBucketOptions,
): Promise<TokenBucketResult> {
  return (
    (await cacheConsumeTokenBucket(options)) ?? memoryStore.consume(options)
  );
}

export async function enforceAiRateLimit(
  {
    headers,
    resourceId,
    kind,
  }: {
    headers: Headers;
    resourceId: string;
    kind: AiRequestKind;
  },
  consume: BucketConsumer = consumeWithFallback,
): Promise<AiRateLimitDecision> {
  const cost = REQUEST_COST[kind];
  const clientIp = getClientIpAddress(headers);
  const buckets: Array<{
    scope: BucketScope;
    options: TokenBucketOptions;
  }> = [];

  // Check IP first so rotating resource ids cannot allocate unlimited local
  // buckets or evade the authoritative per-network burst limit.
  if (clientIp) {
    buckets.push({
      scope: 'ip',
      options: {
        key: `ai-rate:v1:ip:${identifierHash(clientIp)}`,
        ...IP_BUCKET,
        cost,
      },
    });
  }
  buckets.push({
    scope: 'resource',
    options: {
      key: `ai-rate:v1:resource:${identifierHash(resourceId)}`,
      ...RESOURCE_BUCKET,
      cost,
    },
  });

  for (const bucket of buckets) {
    const result = await consume(bucket.options);
    // A custom consumer returning null has the same fail-soft behavior as a
    // cache outage: the process-local limiter still protects this instance.
    const settled = result ?? memoryStore.consume(bucket.options);
    if (!settled.allowed) {
      return {
        allowed: false,
        limitedBy: bucket.scope,
        retryAfterSeconds: Math.max(1, settled.retryAfterSeconds),
      };
    }
  }

  return { allowed: true };
}

export function aiRateLimitResponse(
  decision: Exclude<AiRateLimitDecision, { allowed: true }>,
): Response {
  return new Response(
    `Too many AI requests. Please try again in ${decision.retryAfterSeconds} seconds.`,
    {
      status: 429,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': String(decision.retryAfterSeconds),
      },
    },
  );
}
