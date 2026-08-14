import {
  consumeTokenBucketWithFallback,
  rateLimitIdentifier,
  type TokenBucketConsumer,
  type TokenBucketOptions,
} from '@letschurch/util/rate-limit';
import { getClientIpAddress } from '@letschurch/util/request-ip';

import { cacheConsumeTokenBucket } from './cache';

export type AnswerRateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      limitedBy: 'ip' | 'resource';
      retryAfterSeconds: number;
    };

const REQUEST_COST = {
  answer: 2,
  deep: 4,
} as const;

const IP_BUCKET = {
  capacity: 20,
  refillTokensPerSecond: 1 / 8,
};

const RESOURCE_BUCKET = {
  capacity: 16,
  refillTokensPerSecond: 1 / 10,
};

/** Charge stable IP and normalized-query buckets before answer generation. */
export async function enforceAnswerRateLimit(
  {
    headers,
    query,
    translation,
    deepen,
  }: {
    headers: Headers;
    query: string;
    translation: string;
    deepen: boolean;
  },
  consume: TokenBucketConsumer = cacheConsumeTokenBucket,
): Promise<AnswerRateLimitDecision> {
  const cost = deepen ? REQUEST_COST.deep : REQUEST_COST.answer;
  const clientIp = getClientIpAddress(headers);
  const normalizedQuery = query.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedTranslation = translation.trim().toUpperCase();
  const resource = JSON.stringify([
    normalizedQuery,
    normalizedTranslation,
    deepen ? 'deep' : 'answer',
  ]);
  const buckets: Array<{
    scope: 'ip' | 'resource';
    options: TokenBucketOptions;
  }> = [];

  // IP comes first so changing query or mode cannot evade the network budget or
  // allocate unbounded process-local resource buckets.
  if (clientIp) {
    buckets.push({
      scope: 'ip',
      options: {
        key: `letsbible-ai-rate:v1:ip:${rateLimitIdentifier(clientIp)}`,
        ...IP_BUCKET,
        cost,
      },
    });
  }
  buckets.push({
    scope: 'resource',
    options: {
      key: `letsbible-ai-rate:v1:resource:${rateLimitIdentifier(resource)}`,
      ...RESOURCE_BUCKET,
      cost,
    },
  });

  for (const bucket of buckets) {
    const result = await consumeTokenBucketWithFallback(
      bucket.options,
      consume,
    );
    if (!result.allowed) {
      return {
        allowed: false,
        limitedBy: bucket.scope,
        retryAfterSeconds: Math.max(1, result.retryAfterSeconds),
      };
    }
  }

  return { allowed: true };
}

export function answerRateLimitResponse(
  decision: Exclude<AnswerRateLimitDecision, { allowed: true }>,
): Response {
  return new Response(
    `Too many answer requests. Please try again in ${decision.retryAfterSeconds} seconds.`,
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
