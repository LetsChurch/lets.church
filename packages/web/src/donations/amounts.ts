export const DONATION_MIN_CENTS = 500;
export const DONATION_MAX_CENTS = 5_000_000;

// Card pricing varies by account and payment method. This gross-up uses
// Stripe's standard domestic-card rate only to give donors a stable option.
const ESTIMATED_CARD_PERCENT = 0.029;
const ESTIMATED_CARD_FIXED_CENTS = 30;

export function estimatedFeeCoveredTotal(baseAmountCents: number): number {
  return Math.ceil(
    (baseAmountCents + ESTIMATED_CARD_FIXED_CENTS) /
      (1 - ESTIMATED_CARD_PERCENT),
  );
}

export function donationAmounts(baseAmountCents: number, coverFees: boolean) {
  const amountCents = coverFees
    ? estimatedFeeCoveredTotal(baseAmountCents)
    : baseAmountCents;

  return {
    baseAmountCents,
    feeCoverageCents: amountCents - baseAmountCents,
    amountCents,
  };
}

export function formatDonationAmount(amountCents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}
