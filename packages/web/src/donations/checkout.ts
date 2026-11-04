import { randomUUID } from 'node:crypto';

import { db } from '@letschurch/db';
import type { z } from 'zod';

import type { donationCheckoutSchema } from '@/schemas/donations';

import { donationAmounts } from './amounts';
import { donationCheckoutCustomerParams } from './checkout-customer';
import { donationCheckoutMetadata } from './checkout-metadata';
import { emailBelongsToVerifiedUser } from './donor';
import { normalizeDonationEmail } from './identity';
import { getStripe, getStripeConfig } from './stripe-client';

type CheckoutInput = z.infer<typeof donationCheckoutSchema>;

export async function createDonationCheckout(
  input: CheckoutInput,
  appUserId: string | null,
) {
  const email = normalizeDonationEmail(input.email);
  const linkedAppUserId = (await emailBelongsToVerifiedUser(
    db,
    appUserId,
    email,
  ))
    ? appUserId
    : null;
  const amounts = donationAmounts(input.amountCents, input.coverFees);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  // Nothing is stored until Stripe reports on the session (see webhooks.ts),
  // so abandoned or automated checkouts never reach the database.
  const checkoutId = randomUUID();

  const { WEB_URL } = getStripeConfig();
  const stripe = getStripe();
  const metadata = donationCheckoutMetadata({
    checkoutId,
    email,
    name: input.name,
    appUserId: linkedAppUserId,
    frequency: input.frequency,
    baseAmountCents: amounts.baseAmountCents,
    feeCoverageCents: amounts.feeCoverageCents,
  });
  const recurring = input.frequency === 'MONTHLY';
  const session = await stripe.checkout.sessions.create(
    {
      mode: recurring ? 'subscription' : 'payment',
      ...donationCheckoutCustomerParams(email),
      client_reference_id: checkoutId,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amounts.amountCents,
            product_data: {
              name: recurring
                ? "Monthly donation to Let's Church"
                : "Donation to Let's Church",
            },
            ...(recurring ? { recurring: { interval: 'month' as const } } : {}),
          },
        },
      ],
      metadata,
      payment_intent_data: recurring
        ? undefined
        : {
            description: "Donation to Let's Church Inc.",
            metadata: { donationCheckoutId: checkoutId },
          },
      subscription_data: recurring
        ? {
            description: "Monthly donation to Let's Church Inc.",
            // Only the id: the subscription outlives the checkout, so the
            // donor's details stay on the session (see webhooks.ts).
            metadata: { donationCheckoutId: checkoutId },
          }
        : undefined,
      submit_type: 'donate',
      success_url: `${WEB_URL}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${WEB_URL}/donate?canceled=true`,
    },
    {
      idempotencyKey: `donation-checkout-${checkoutId}`,
    },
  );

  if (!session.url) throw new Error('Stripe did not return a checkout URL');

  return {
    url: session.url,
    sessionId: session.id,
  };
}
