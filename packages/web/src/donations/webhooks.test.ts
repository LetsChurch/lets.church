import { describe, expect, it } from 'vitest';

import {
  resolveCheckoutDonationStatus,
  resolveDonationAdjustmentStatus,
  resolveSubscriptionAmounts,
  stripeInvoiceExpand,
} from './reconciliation';

describe('donation webhook reconciliation', () => {
  it('keeps Stripe invoice expansions within the four-level limit', () => {
    expect(stripeInvoiceExpand).toEqual([
      'payments.data.payment.payment_intent',
    ]);
    expect(
      stripeInvoiceExpand.every((path) => path.split('.').length <= 4),
    ).toBe(true);
  });

  it('uses current Stripe state when asynchronous checkout events arrive late', () => {
    expect(
      resolveCheckoutDonationStatus({
        eventType: 'checkout.session.async_payment_failed',
        paymentStatus: 'paid',
        paymentIntentStatus: 'succeeded',
      }),
    ).toBe('SUCCEEDED');
    expect(
      resolveCheckoutDonationStatus({
        eventType: 'checkout.session.completed',
        paymentStatus: 'unpaid',
        paymentIntentStatus: 'requires_payment_method',
      }),
    ).toBe('FAILED');
    expect(
      resolveCheckoutDonationStatus({
        eventType: 'checkout.session.async_payment_succeeded',
        paymentStatus: 'unpaid',
        paymentIntentStatus: 'processing',
      }),
    ).toBe('SUCCEEDED');
  });

  it('keeps a valid fee split and falls back after a Stripe amount change', () => {
    expect(
      resolveSubscriptionAmounts(2_606, [
        { baseAmountCents: 2_500, feeCoverageCents: 106 },
      ]),
    ).toEqual({ baseAmountCents: 2_500, feeCoverageCents: 106 });
    expect(
      resolveSubscriptionAmounts(5_000, [
        { baseAmountCents: 2_500, feeCoverageCents: 106 },
      ]),
    ).toEqual({ baseAmountCents: 5_000, feeCoverageCents: 0 });
  });

  it('gives an open dispute precedence over refund state', () => {
    expect(
      resolveDonationAdjustmentStatus({
        amountCents: 2_500,
        refundedAmountCents: 2_500,
        disputeStatus: 'under_review',
      }),
    ).toBe('DISPUTED');
  });

  it('restores the correct refund state when a dispute closes without loss', () => {
    expect(
      resolveDonationAdjustmentStatus({
        amountCents: 2_500,
        refundedAmountCents: 1_000,
        disputeStatus: 'won',
      }),
    ).toBe('PARTIALLY_REFUNDED');
  });
});
