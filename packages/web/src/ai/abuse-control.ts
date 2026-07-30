import { type TokenBucketOptions, type TokenBucketResult } from '@/util/cache';
import {
  consumeTokenBucketWithFallback,
  rateLimitIdentifier,
} from '@/util/rate-limit';
import { getClientIpAddress } from '@/util/request-ip';

export { createMemoryTokenBucketStore } from '@/util/rate-limit';

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

async function consumeWithFallback(
  options: TokenBucketOptions,
): Promise<TokenBucketResult> {
  return consumeTokenBucketWithFallback(options);
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
        key: `ai-rate:v1:ip:${rateLimitIdentifier(clientIp)}`,
        ...IP_BUCKET,
        cost,
      },
    });
  }
  buckets.push({
    scope: 'resource',
    options: {
      key: `ai-rate:v1:resource:${rateLimitIdentifier(resourceId)}`,
      ...RESOURCE_BUCKET,
      cost,
    },
  });

  for (const bucket of buckets) {
    const result = await consume(bucket.options);
    // A custom consumer returning null has the same fail-soft behavior as a
    // cache outage: the process-local limiter still protects this instance.
    const settled =
      result ?? (await consumeTokenBucketWithFallback(bucket.options));
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
