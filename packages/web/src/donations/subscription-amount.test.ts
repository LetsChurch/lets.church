import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { donationAmounts } from './amounts';
import { subscriptionAmountUpdateParams } from './subscription-amount';

function subscription(
  items: Array<{
    id: string;
    currency?: string;
    recurring?: { interval: 'month' | 'year'; interval_count: number } | null;
  }>,
) {
  return {
    id: 'sub_123',
    items: {
      data: items.map((item) => ({
        id: item.id,
        price: {
          currency: item.currency ?? 'usd',
          recurring:
            item.recurring === undefined
              ? { interval: 'month', interval_count: 1 }
              : item.recurring,
        },
      })),
    },
  } as unknown as Stripe.Subscription;
}

describe('recurring donation amount changes', () => {
  it('replaces the item price on the same interval without proration', () => {
    expect(
      subscriptionAmountUpdateParams(
        subscription([{ id: 'si_123' }]),
        donationAmounts(5_000, false),
        'prod_recurring',
      ),
    ).toEqual({
      items: [
        {
          id: 'si_123',
          quantity: 1,
          price_data: {
            currency: 'usd',
            product: 'prod_recurring',
            unit_amount: 5_000,
            recurring: { interval: 'month', interval_count: 1 },
          },
        },
      ],
      proration_behavior: 'none',
      metadata: {
        donationBaseAmountCents: '5000',
        donationFeeCoverageCents: '0',
      },
    });
  });

  it('charges the fee-covered total and records the split', () => {
    const amounts = donationAmounts(2_500, true);
    const params = subscriptionAmountUpdateParams(
      subscription([
        {
          id: 'si_123',
          recurring: { interval: 'year', interval_count: 1 },
        },
      ]),
      amounts,
      'prod_recurring',
    );

    expect(params.items?.[0]?.price_data).toMatchObject({
      product: 'prod_recurring',
      unit_amount: amounts.amountCents,
      recurring: { interval: 'year', interval_count: 1 },
    });
    expect(params.metadata).toEqual({
      donationBaseAmountCents: '2500',
      donationFeeCoverageCents: String(amounts.feeCoverageCents),
    });
  });

  it('refuses subscriptions it cannot safely reprice', () => {
    const amounts = donationAmounts(2_500, false);
    expect(() =>
      subscriptionAmountUpdateParams(
        subscription([{ id: 'si_1' }, { id: 'si_2' }]),
        amounts,
        'prod_recurring',
      ),
    ).toThrow('exactly one item');
    expect(() =>
      subscriptionAmountUpdateParams(
        subscription([{ id: 'si_1', recurring: null }]),
        amounts,
        'prod_recurring',
      ),
    ).toThrow('no recurring price');
  });
});
