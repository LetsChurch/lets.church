import { Donation, db } from '@letschurch/db';
import { createFileRoute } from '@tanstack/react-router';
import { eq } from 'drizzle-orm';

import { checkoutStatusSchema } from '@/schemas/donations';
import logger from '@/util/logger';

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

export const Route = createFileRoute('/api/donations/status')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = checkoutStatusSchema.safeParse({
          sessionId: url.searchParams.get('session_id'),
        });
        if (!parsed.success) {
          return statusResponse(
            { error: 'Donation status is unavailable.' },
            400,
          );
        }

        const checkout = await db.query.DonationCheckout.findFirst({
          where: (table, { eq }) =>
            eq(table.stripeCheckoutSessionId, parsed.data.sessionId),
          columns: {
            id: true,
            status: true,
            frequency: true,
            amountCents: true,
            currency: true,
          },
        });
        if (!checkout) {
          return statusResponse({ status: 'PROCESSING' });
        }

        let donation = await db
          .select({ status: Donation.status })
          .from(Donation)
          .where(eq(Donation.checkoutId, checkout.id))
          .limit(1)
          .then((rows) => rows[0] ?? null);

        if (!donation && checkout.status !== 'EXPIRED') {
          try {
            const { reconcileStripeCheckoutSession } =
              await import('@/donations/webhooks');
            await reconcileStripeCheckoutSession(parsed.data.sessionId);
            donation = await db
              .select({ status: Donation.status })
              .from(Donation)
              .where(eq(Donation.checkoutId, checkout.id))
              .limit(1)
              .then((rows) => rows[0] ?? null);
          } catch (error) {
            moduleLogger.warn(
              {
                err: error instanceof Error ? error : new Error(String(error)),
                context: { checkoutId: checkout.id },
              },
              'Stripe checkout status reconciliation failed',
            );
          }
        }

        return statusResponse({
          status:
            donation?.status ??
            (checkout.status === 'EXPIRED' ? 'EXPIRED' : 'PROCESSING'),
          frequency: checkout.frequency,
          amountCents: checkout.amountCents,
          currency: checkout.currency,
        });
      },
    },
  },
});
