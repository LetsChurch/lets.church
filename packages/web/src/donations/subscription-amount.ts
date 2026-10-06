import type Stripe from 'stripe';

import type { donationAmounts } from './amounts';

type DonationAmounts = ReturnType<typeof donationAmounts>;

let recurringProductId: string | null = null;

/**
 * Finds or creates the active product that repriced recurring donations use.
 *
 * Checkout's inline `product_data` creates an inactive product, and Stripe
 * refuses new prices on inactive products, so an amount change can't reuse the
 * product a checkout subscription started with.
 */
export async function recurringDonationProductId(stripe: Stripe) {
  if (recurringProductId) return recurringProductId;
  for await (const product of stripe.products.list({
    active: true,
    limit: 100,
  })) {
    if (product.metadata.donationRecurringProduct === 'true') {
      recurringProductId = product.id;
      return product.id;
    }
  }
  const product = await stripe.products.create(
    {
      name: "Recurring donation to Let's Church",
      metadata: { donationRecurringProduct: 'true' },
    },
    { idempotencyKey: 'donation-recurring-product-v1' },
  );
  recurringProductId = product.id;
  return product.id;
}

/**
 * Builds the Stripe update that moves a recurring donation to a new amount.
 *
 * Checkout and recurring-plan imports both create one-off prices, so there is
 * no catalog price to switch to; the item gets a new inline price on the
 * recurring-donation product with the same currency and billing interval
 * (see `recurringDonationProductId`). The change applies from the next
 * invoice with no proration. The fee split goes into metadata so webhook
 * reconciliation can tell base gift from fee coverage on the new amount.
 */
export function subscriptionAmountUpdateParams(
  subscription: Stripe.Subscription,
  amounts: DonationAmounts,
  productId: string,
): Stripe.SubscriptionUpdateParams {
  if (subscription.items.data.length !== 1) {
    throw new Error(
      `Subscription ${subscription.id} does not have exactly one item`,
    );
  }
  const item = subscription.items.data[0]!;
  const { recurring } = item.price;
  if (!recurring) {
    throw new Error(`Subscription ${subscription.id} has no recurring price`);
  }

  return {
    items: [
      {
        id: item.id,
        quantity: 1,
        price_data: {
          currency: item.price.currency,
          product: productId,
          unit_amount: amounts.amountCents,
          recurring: {
            interval: recurring.interval,
            interval_count: recurring.interval_count,
          },
        },
      },
    ],
    proration_behavior: 'none',
    metadata: {
      donationBaseAmountCents: String(amounts.baseAmountCents),
      donationFeeCoverageCents: String(amounts.feeCoverageCents),
    },
  };
}
