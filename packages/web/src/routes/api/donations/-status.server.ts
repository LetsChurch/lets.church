import '@tanstack/react-start/server-only';
import { Donation, db } from '@letschurch/db';
import { eq } from 'drizzle-orm';

import { checkoutStatusSchema } from '@/schemas/donations';
import logger from '@/util/logger';
import type { DonationStatusRateLimitDecision } from '@/util/public-action-rate-limit';
import {
  enforceDonationStatusRateLimit,
  publicActionRateLimitResponse,
} from '@/util/public-action-rate-limit';

const moduleLogger = logger.child({
  module: 'routes/api/donations/status',
});

function statusResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
    },
  });
}

type CheckoutRecord = {
  id: string;
  status: 'OPEN' | 'COMPLETED' | 'EXPIRED';
  frequency: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  amountCents: number;
  currency: string;
};

type DonationRecord = {
  status:
    | 'PENDING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELED'
    | 'REFUNDED'
    | 'PARTIALLY_REFUNDED'
    | 'DISPUTED';
} | null;

async function findCheckoutRecord(sessionId: string) {
  return db.query.DonationCheckout.findFirst({
    where: (table, { eq }) => eq(table.stripeCheckoutSessionId, sessionId),
    columns: {
      id: true,
      status: true,
      frequency: true,
      amountCents: true,
      currency: true,
    },
  });
}

async function findDonationRecord(checkoutId: string) {
  return db
    .select({ status: Donation.status })
    .from(Donation)
    .where(eq(Donation.checkoutId, checkoutId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function enforceStatusRateLimit(headers: Headers, sessionId: string) {
  return enforceDonationStatusRateLimit({ headers, sessionId });
}

async function reconcileCheckout(sessionId: string) {
  // Loading the Stripe webhook module is intentionally deferred until after
  // durable-state checks and rate-limit admission.
  const { reconcileStripeCheckoutSession } =
    await import('@/donations/webhooks');
  await reconcileStripeCheckoutSession(sessionId);
}

export type DonationStatusDependencies = {
  findCheckout: (sessionId: string) => Promise<CheckoutRecord | undefined>;
  findDonation: (checkoutId: string) => Promise<DonationRecord>;
  enforceRateLimit: (
    headers: Headers,
    sessionId: string,
  ) => Promise<DonationStatusRateLimitDecision>;
  reconcile: (sessionId: string) => Promise<void>;
};

const defaultDependencies: DonationStatusDependencies = {
  findCheckout: findCheckoutRecord,
  findDonation: findDonationRecord,
  enforceRateLimit: enforceStatusRateLimit,
  reconcile: reconcileCheckout,
};

function checkoutStatusResponse(
  checkout: CheckoutRecord,
  donation: DonationRecord,
) {
  return statusResponse({
    status:
      donation?.status ??
      (checkout.status === 'EXPIRED' ? 'EXPIRED' : 'PROCESSING'),
    frequency: checkout.frequency,
    amountCents: checkout.amountCents,
    currency: checkout.currency,
  });
}

export async function handleDonationStatusRequest(
  request: Request,
  dependencies: DonationStatusDependencies = defaultDependencies,
) {
  const url = new URL(request.url);
  const parsed = checkoutStatusSchema.safeParse({
    sessionId: url.searchParams.get('session_id'),
  });
  if (!parsed.success) {
    return statusResponse({ error: 'Donation status is unavailable.' }, 400);
  }

  const checkout = await dependencies.findCheckout(parsed.data.sessionId);
  if (!checkout) {
    return statusResponse({ status: 'PROCESSING' });
  }

  let donation = await dependencies.findDonation(checkout.id);

  if (!donation && checkout.status !== 'EXPIRED') {
    const rateLimit = await dependencies.enforceRateLimit(
      request.headers,
      parsed.data.sessionId,
    );
    if (!rateLimit.allowed) {
      if (rateLimit.limitedBy === 'session') {
        return checkoutStatusResponse(checkout, donation);
      }
      moduleLogger.warn(
        {
          context: {
            limitedBy: rateLimit.limitedBy,
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          },
        },
        'Donation status request rate limited',
      );
      return publicActionRateLimitResponse(rateLimit);
    }

    try {
      await dependencies.reconcile(parsed.data.sessionId);
      donation = await dependencies.findDonation(checkout.id);
    } catch (error) {
      moduleLogger.warn(
        {
          context: {
            checkoutId: checkout.id,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          },
        },
        'Stripe checkout status reconciliation failed',
      );
    }
  }

  return checkoutStatusResponse(checkout, donation);
}
