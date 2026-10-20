export type ReconciledDonationStatus =
  | 'SUCCEEDED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'DISPUTED';

export const stripeInvoiceExpand = [
  'payments.data.payment.payment_intent',
] as const;

export function resolveCheckoutDonationStatus(input: {
  eventType: string;
  paymentStatus: string;
  paymentIntentStatus: string | null;
}): 'PENDING' | 'SUCCEEDED' | 'FAILED' {
  if (
    input.paymentStatus === 'paid' ||
    input.paymentIntentStatus === 'succeeded'
  ) {
    return 'SUCCEEDED';
  }
  if (
    input.paymentIntentStatus === 'requires_payment_method' ||
    input.paymentIntentStatus === 'canceled'
  ) {
    return 'FAILED';
  }
  if (input.eventType === 'checkout.session.async_payment_succeeded') {
    return 'SUCCEEDED';
  }
  return input.eventType === 'checkout.session.async_payment_failed'
    ? 'FAILED'
    : 'PENDING';
}

export function resolveSubscriptionAmounts(
  amountCents: number,
  candidates: Array<{
    baseAmountCents: number;
    feeCoverageCents: number;
  } | null>,
) {
  const matching = candidates.find(
    (candidate) =>
      candidate != null &&
      candidate.baseAmountCents > 0 &&
      candidate.feeCoverageCents >= 0 &&
      candidate.baseAmountCents + candidate.feeCoverageCents === amountCents,
  );
  return (
    matching ?? {
      baseAmountCents: amountCents,
      feeCoverageCents: 0,
    }
  );
}

function disputeClosedWithoutLoss(status: string | null) {
  return (
    status != null && ['won', 'prevented', 'warning_closed'].includes(status)
  );
}

export function resolveDonationAdjustmentStatus(input: {
  amountCents: number;
  refundedAmountCents: number;
  disputeStatus: string | null;
}): ReconciledDonationStatus {
  if (input.disputeStatus && !disputeClosedWithoutLoss(input.disputeStatus)) {
    return 'DISPUTED';
  }
  if (input.refundedAmountCents >= input.amountCents) return 'REFUNDED';
  if (input.refundedAmountCents > 0) return 'PARTIALLY_REFUNDED';
  return 'SUCCEEDED';
}

type CancelSchedule = {
  cancel_at_period_end: boolean;
  cancel_at: number | null;
};

/**
 * Whether a customer.subscription.updated event is the one that scheduled the
 * plan to cancel. Stripe's previous_attributes only lists changed keys, so a
 * missing key means the value was unchanged. Donor and admin cancellations set
 * cancel_at_period_end; the Billing Portal may set cancel_at instead.
 */
export function isNewlyScheduledCancellation(
  previous: Partial<CancelSchedule> | undefined,
  current: CancelSchedule & { status: string },
) {
  if (!previous) return false;
  const isScheduled = (schedule: CancelSchedule) =>
    schedule.cancel_at_period_end || schedule.cancel_at != null;
  const before = {
    cancel_at_period_end:
      'cancel_at_period_end' in previous
        ? Boolean(previous.cancel_at_period_end)
        : current.cancel_at_period_end,
    cancel_at:
      'cancel_at' in previous
        ? (previous.cancel_at ?? null)
        : current.cancel_at,
  };
  return (
    current.status !== 'canceled' &&
    isScheduled(current) &&
    !isScheduled(before)
  );
}
