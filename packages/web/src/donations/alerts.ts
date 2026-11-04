import { DonationAlert } from '@letschurch/db';
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { DbClient } from './donor';

export type DonationAlertInput = {
  kind: (typeof DonationAlert.$inferInsert)['kind'];
  stripeObjectId: string;
  livemode: boolean;
  stripeCheckoutSessionId?: string | null;
  subscriptionId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  message?: string | null;
};

const MAX_MESSAGE_LENGTH = 500;

/**
 * Record a problem for the admin dashboard. A repeat for the same Stripe
 * object counts another occurrence and reopens a dismissed alert. Returns how
 * many times the object has failed.
 */
export async function raiseDonationAlert(
  client: DbClient,
  alert: DonationAlertInput,
) {
  const message = alert.message?.slice(0, MAX_MESSAGE_LENGTH) ?? null;
  const [row] = await client
    .insert(DonationAlert)
    .values({ ...alert, message })
    .onConflictDoUpdate({
      target: DonationAlert.stripeObjectId,
      set: {
        occurrences: sql`${DonationAlert.occurrences} + 1`,
        message,
        lastSeenAt: new Date(),
        resolvedAt: null,
      },
    })
    .returning({ occurrences: DonationAlert.occurrences });
  return row?.occurrences ?? 1;
}

/** Resolve open alerts once the problem behind them has cleared. */
export async function resolveDonationAlerts(
  client: DbClient,
  match: { stripeObjectId: string } | { stripeCheckoutSessionId: string },
) {
  await client
    .update(DonationAlert)
    .set({ resolvedAt: new Date() })
    .where(
      and(
        isNull(DonationAlert.resolvedAt),
        'stripeObjectId' in match
          ? eq(DonationAlert.stripeObjectId, match.stripeObjectId)
          : eq(
              DonationAlert.stripeCheckoutSessionId,
              match.stripeCheckoutSessionId,
            ),
      ),
    );
}

/**
 * A subscription or invoice event that arrived before Stripe linked its
 * Checkout Session to the subscription. The webhook fails so Stripe retries,
 * and the retry normally applies, so this is not a problem at first.
 */
export class CheckoutNotLinkedError extends Error {
  override name = 'CheckoutNotLinkedError';
}

// Stripe links the session within seconds; an event still unlinked this long
// after it was created needs a look.
export const CHECKOUT_LINK_GRACE_SECONDS = 15 * 60;

/** Whether a failed event belongs on the dashboard yet. */
export function shouldAlertWebhookFailure(
  error: unknown,
  eventCreated: number,
  now = Date.now(),
) {
  if (!(error instanceof CheckoutNotLinkedError)) return true;
  return now / 1000 - eventCreated >= CHECKOUT_LINK_GRACE_SECONDS;
}

/** Where an alert's Stripe object lives in the Stripe dashboard. */
export function stripeDashboardUrl(stripeObjectId: string, livemode: boolean) {
  const base = livemode
    ? 'https://dashboard.stripe.com'
    : 'https://dashboard.stripe.com/test';
  const id = encodeURIComponent(stripeObjectId);
  if (stripeObjectId.startsWith('pi_')) return `${base}/payments/${id}`;
  if (stripeObjectId.startsWith('in_')) return `${base}/invoices/${id}`;
  if (stripeObjectId.startsWith('evt_')) return `${base}/events/${id}`;
  return null;
}
