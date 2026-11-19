/**
 * Donation facts shared by the web app (receipts, the printable statement page)
 * and the Temporal year-end statement email, so the tax documents can't drift
 * apart. Dependency-free: safe for client bundles and workflow code.
 */

export const DONATION_EIN = '92-3744006';

/** Gift statuses that appear on a giving statement. */
export const DONATION_STATEMENT_STATUSES = [
  'SUCCEEDED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;

export function isStatementDonationStatus(status: string) {
  return (DONATION_STATEMENT_STATUSES as ReadonlyArray<string>).includes(
    status,
  );
}

/** What the donor actually gave, net of refunds. */
export function donationNetCents(donation: {
  amountCents: number;
  refundedAmountCents: number;
}) {
  return donation.amountCents - donation.refundedAmountCents;
}

export function formatDonationAmount(amountCents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}
