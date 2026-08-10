import { cacheConsumeTokenBucket, type TokenBucketOptions } from '@/util/cache';
import {
  rateLimitIdentifier,
  type TokenBucketConsumer,
} from '@/util/rate-limit';
import { getClientIpAddress } from '@/util/request-ip';

export type SearchRequestKind = 'search' | 'search-deep';

export type SearchRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

// A normal search may fan out into result, facet, channel, and snippet queries.
// Keep a generous human-sized burst while bounding sustained anonymous traffic
// from one client. Deep fallback searches cost twice as much because they also
// run vector retrieval and cosine reranking.
const IP_BUCKET = {
  capacity: 20,
  refillTokensPerSecond: 1 / 2,
};

export async function enforceSearchRateLimit(
  {
    headers,
    kind,
  }: {
    headers: Headers;
    kind: SearchRequestKind;
  },
  consume: TokenBucketConsumer = cacheConsumeTokenBucket,
): Promise<SearchRateLimitDecision> {
  const clientIp = getClientIpAddress(headers);
  if (!clientIp) return { allowed: true };

  const options: TokenBucketOptions = {
    key: `search-rate:v1:ip:${rateLimitIdentifier(clientIp)}`,
    ...IP_BUCKET,
    cost: kind === 'search-deep' ? 2 : 1,
  };
  // Search remains available when Valkey is disabled or unavailable. This
  // limiter is traffic protection, not an availability dependency.
  const result = await consume(options);
  if (!result) return { allowed: true };

  return result.allowed
    ? { allowed: true }
    : {
        allowed: false,
        retryAfterSeconds: Math.max(1, result.retryAfterSeconds),
      };
}
