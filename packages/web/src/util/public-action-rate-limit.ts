import type { TokenBucketOptions, TokenBucketResult } from '@/util/cache';
import {
  consumeTokenBucketWithFallback,
  rateLimitIdentifier,
  type TokenBucketConsumer,
} from '@/util/rate-limit';
import { getClientIpAddress } from '@/util/request-ip';

import { normalizeEmail } from './normalize-email';

export type PublicActionKind = 'donation-checkout' | 'email-sign-in';
type BucketScope = 'ip' | 'email';
type DonationStatusBucketScope = 'ip' | 'session';

export type PublicActionRateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      limitedBy: BucketScope;
      retryAfterSeconds: number;
    };

export type DonationStatusRateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      limitedBy: DonationStatusBucketScope;
      retryAfterSeconds: number;
    };

const BUCKETS: Record<
  PublicActionKind,
  Record<
    BucketScope,
    Pick<TokenBucketOptions, 'capacity' | 'refillTokensPerSecond'>
  >
> = {
  'donation-checkout': {
    ip: { capacity: 10, refillTokensPerSecond: 1 / 60 },
    email: { capacity: 5, refillTokensPerSecond: 1 / 300 },
  },
  'email-sign-in': {
    ip: { capacity: 10, refillTokensPerSecond: 1 / 60 },
    email: { capacity: 3, refillTokensPerSecond: 1 / 600 },
  },
};

const DONATION_STATUS_BUCKETS: Record<
  DonationStatusBucketScope,
  Pick<TokenBucketOptions, 'capacity' | 'refillTokensPerSecond'>
> = {
  // The confirmation page polls every two seconds. This permits that normal
  // cadence while bounding traffic from clients cycling through session IDs.
  ip: { capacity: 30, refillTokensPerSecond: 1 / 2 },
  // Provider reconciliation is only recovery for a delayed webhook.
  session: { capacity: 1, refillTokensPerSecond: 1 / 10 },
};

async function defaultConsumer(options: TokenBucketOptions) {
  return consumeTokenBucketWithFallback(options);
}

export async function enforcePublicActionRateLimit(
  {
    headers,
    email,
    kind,
  }: {
    headers: Headers;
    email: string;
    kind: PublicActionKind;
  },
  consume: TokenBucketConsumer = defaultConsumer,
): Promise<PublicActionRateLimitDecision> {
  const clientIp = getClientIpAddress(headers);
  const buckets: Array<{
    scope: BucketScope;
    options: TokenBucketOptions;
  }> = [];

  if (clientIp) {
    buckets.push({
      scope: 'ip',
      options: {
        key: `public-action-rate:v1:${kind}:ip:${rateLimitIdentifier(clientIp)}`,
        ...BUCKETS[kind].ip,
        cost: 1,
      },
    });
  }
  buckets.push({
    scope: 'email',
    options: {
      key: `public-action-rate:v1:${kind}:email:${rateLimitIdentifier(
        normalizeEmail(email),
      )}`,
      ...BUCKETS[kind].email,
      cost: 1,
    },
  });

  for (const bucket of buckets) {
    const result: TokenBucketResult =
      (await consume(bucket.options)) ??
      (await consumeTokenBucketWithFallback(bucket.options));
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

export async function enforceDonationStatusRateLimit(
  {
    headers,
    sessionId,
  }: {
    headers: Headers;
    sessionId: string;
  },
  consume: TokenBucketConsumer = defaultConsumer,
): Promise<DonationStatusRateLimitDecision> {
  const clientIp = getClientIpAddress(headers);
  const buckets: Array<{
    scope: DonationStatusBucketScope;
    options: TokenBucketOptions;
  }> = [];

  if (clientIp) {
    buckets.push({
      scope: 'ip',
      options: {
        key: `public-action-rate:v1:donation-status:ip:${rateLimitIdentifier(
          clientIp,
        )}`,
        ...DONATION_STATUS_BUCKETS.ip,
        cost: 1,
      },
    });
  }
  buckets.push({
    scope: 'session',
    options: {
      key: `public-action-rate:v1:donation-status:session:${rateLimitIdentifier(
        sessionId,
      )}`,
      ...DONATION_STATUS_BUCKETS.session,
      cost: 1,
    },
  });

  for (const bucket of buckets) {
    const result: TokenBucketResult =
      (await consume(bucket.options)) ??
      (await consumeTokenBucketWithFallback(bucket.options));
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

export const PUBLIC_ACTION_RATE_LIMIT_MESSAGE =
  'Too many requests. Wait a few minutes and try again.';

export function publicActionRateLimitResponse(
  decision:
    | Exclude<PublicActionRateLimitDecision, { allowed: true }>
    | Exclude<DonationStatusRateLimitDecision, { allowed: true }>,
) {
  return Response.json(
    { error: PUBLIC_ACTION_RATE_LIMIT_MESSAGE },
    {
      status: 429,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(decision.retryAfterSeconds),
      },
    },
  );
}
