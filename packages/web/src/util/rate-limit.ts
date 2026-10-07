import {
  consumeTokenBucketWithFallback as consumeWithSharedFallback,
  rateLimitIdentifier,
  type TokenBucketConsumer,
  type TokenBucketOptions,
  type TokenBucketResult,
} from '@letschurch/util/rate-limit';

import { cacheConsumeTokenBucket } from './cache';

export {
  createMemoryTokenBucketStore,
  rateLimitIdentifier,
} from '@letschurch/util/rate-limit';
export type { TokenBucketConsumer } from '@letschurch/util/rate-limit';

/** Preserve the web limiter API while keeping Valkey infrastructure app-local. */
export async function consumeTokenBucketWithFallback(
  options: TokenBucketOptions,
  consume: TokenBucketConsumer = cacheConsumeTokenBucket,
): Promise<TokenBucketResult> {
  return consumeWithSharedFallback(options, consume);
}

/**
 * A verified per-client identity that may share a network address with many
 * other clients — e.g. a signed MCP session arriving through a hosted gateway.
 *
 * Limiters that receive a subject give it its own bucket (the normal per-client
 * budget) and turn the per-IP bucket into a *shared ceiling* that is
 * `sharedIpMultiplier`× the normal one. Many honest clients behind one gateway
 * then don't starve each other, while a single network still can't exceed the
 * ceiling by minting more subjects.
 */
export type RateLimitSubject = {
  key: string;
  sharedIpMultiplier: number;
};

type BucketShape = Pick<
  TokenBucketOptions,
  'capacity' | 'refillTokensPerSecond'
>;

export type ClientBucket = {
  scope: 'ip' | 'shared-ip' | 'subject';
  options: TokenBucketOptions;
};

/**
 * Per-client token buckets for one request, in the order they should be
 * consumed. The IP (or shared-IP ceiling) bucket comes first so a flood of
 * fresh subjects from one network is cut off before it allocates subject
 * buckets.
 */
export function clientBuckets({
  prefix,
  clientIp,
  subject,
  bucket,
  cost,
}: {
  prefix: string;
  clientIp: string | null;
  subject: RateLimitSubject | null | undefined;
  bucket: BucketShape;
  cost: number;
}): Array<ClientBucket> {
  const buckets: Array<ClientBucket> = [];
  if (clientIp) {
    const ip = rateLimitIdentifier(clientIp);
    buckets.push(
      subject
        ? {
            scope: 'shared-ip',
            options: {
              key: `${prefix}:shared-ip:${ip}`,
              capacity: bucket.capacity * subject.sharedIpMultiplier,
              refillTokensPerSecond:
                bucket.refillTokensPerSecond * subject.sharedIpMultiplier,
              cost,
            },
          }
        : {
            scope: 'ip',
            options: { key: `${prefix}:ip:${ip}`, ...bucket, cost },
          },
    );
  }
  if (subject) {
    buckets.push({
      scope: 'subject',
      options: {
        key: `${prefix}:subject:${rateLimitIdentifier(subject.key)}`,
        ...bucket,
        cost,
      },
    });
  }
  return buckets;
}
