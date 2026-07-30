import { createFileRoute } from '@tanstack/react-router';
import type Stripe from 'stripe';

import logger from '@/util/logger';
import {
  readRequestBody,
  RequestBodyTooLargeError,
} from '@/util/read-request-body';

const moduleLogger = logger.child({
  module: 'routes/webhooks/stripe',
});
const MAX_STRIPE_WEBHOOK_BYTES = 2 * 1024 * 1024;

export const Route = createFileRoute('/webhooks_/stripe')({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get('stripe-signature');

        try {
          const body = await readRequestBody(request, MAX_STRIPE_WEBHOOK_BYTES);
          const [
            { getStripe, getStripeWebhookSecret },
            { processStripeEvent },
          ] = await Promise.all([
            import('@/donations/stripe-client'),
            import('@/donations/webhooks'),
          ]);
          const secret = getStripeWebhookSecret();
          let event: Stripe.Event;

          if (secret) {
            if (!signature) {
              moduleLogger.warn('Stripe webhook rejected without a signature');
              return new Response('webhook rejected', { status: 400 });
            }
            event = getStripe().webhooks.constructEvent(
              body,
              signature,
              secret,
            );
          } else if (process.env.NODE_ENV === 'production') {
            moduleLogger.error(
              'STRIPE_WEBHOOK_SECRET is not set; refusing to process unverified webhook',
            );
            return new Response('webhook unavailable', {
              status: 500,
            });
          } else {
            moduleLogger.warn(
              'STRIPE_WEBHOOK_SECRET not set; skipping signature verification (dev only)',
            );
            try {
              event = JSON.parse(body) as Stripe.Event;
            } catch {
              return new Response('webhook rejected', { status: 400 });
            }
          }

          const result = await processStripeEvent(event);
          return Response.json({ received: true, duplicate: result.duplicate });
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError) {
            return new Response('webhook rejected', { status: 413 });
          }
          moduleLogger.error(
            {
              err: error instanceof Error ? error : new Error(String(error)),
            },
            'Stripe webhook failed',
          );
          return new Response('webhook rejected', { status: 400 });
        }
      },
    },
  },
});
