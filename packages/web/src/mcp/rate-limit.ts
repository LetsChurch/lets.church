import { cacheConsumeTokenBucket } from '@/util/cache';
import {
  clientBuckets,
  type RateLimitSubject,
  type TokenBucketConsumer,
} from '@/util/rate-limit';
import { getClientIpAddress } from '@/util/request-ip';

// Every MCP tool call costs one token, on top of the search/AI limiters the
// wrapped procedures already apply. It bounds the cheap-but-unlimited reads
// (transcripts, channel profiles) that the web app doesn't rate limit because
// humans can't page through them at agent speed.
const CALL_BUCKET = {
  capacity: 60,
  refillTokensPerSecond: 1,
};

/**
 * How many clients' worth of budget one network address may use in total when
 * its requests carry verified MCP sessions. Hosted MCP clients (chat apps)
 * funnel many users through a few egress IPs; this is the shared ceiling for
 * all of them. Tune from observed gateway traffic.
 */
export const MCP_SHARED_IP_MULTIPLIER = 25;

export function mcpRateLimitSubject(sessionKey: string): RateLimitSubject {
  return {
    key: `mcp-session:${sessionKey}`,
    sharedIpMultiplier: MCP_SHARED_IP_MULTIPLIER,
  };
}

export type McpCallRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export async function enforceMcpCallRateLimit(
  {
    headers,
    subject,
  }: {
    headers: Headers;
    subject: RateLimitSubject | null;
  },
  consume: TokenBucketConsumer = cacheConsumeTokenBucket,
): Promise<McpCallRateLimitDecision> {
  const buckets = clientBuckets({
    prefix: 'mcp-call:v1',
    clientIp: getClientIpAddress(headers),
    subject,
    bucket: CALL_BUCKET,
    cost: 1,
  });
  for (const { options } of buckets) {
    // Fail open when the cache is unavailable, like the search limiter.
    const result = await consume(options);
    if (result && !result.allowed) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, result.retryAfterSeconds),
      };
    }
  }
  return { allowed: true };
}
