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
