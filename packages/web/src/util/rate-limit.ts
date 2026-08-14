import {
  consumeTokenBucketWithFallback as consumeWithSharedFallback,
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
