/**
 * Donation checkouts are not stored until Stripe reports progress on them, so
 * the gift's details travel in the Checkout Session's metadata instead (a
 * subscription carries only the checkout id). Only our server writes this
 * metadata; the donor cannot change it.
 */
export type PendingDonationCheckout = {
  checkoutId: string;
  email: string;
  name: string;
  // Set only when the signed-in user has verified `email`.
  appUserId: string | null;
  frequency: 'ONE_TIME' | 'MONTHLY';
  baseAmountCents: number;
  feeCoverageCents: number;
};

// Metadata can be edited in the Stripe dashboard, and a value that isn't a
// uuid would fail our uuid columns on every webhook retry.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID.test(value);
}

export function donationCheckoutMetadata(checkout: PendingDonationCheckout) {
  return {
    donationCheckoutId: checkout.checkoutId,
    donationDonorEmail: checkout.email,
    donationFrequency: checkout.frequency,
    donationBaseAmountCents: String(checkout.baseAmountCents),
    donationFeeCoverageCents: String(checkout.feeCoverageCents),
    // Stripe drops empty metadata values, so optional fields are omitted.
    ...(checkout.name ? { donationDonorName: checkout.name } : {}),
    ...(checkout.appUserId ? { donationAppUserId: checkout.appUserId } : {}),
  };
}

/** Parse a whole number of cents from Stripe metadata; null if malformed. */
export function parseMetadataCents(value: string | undefined) {
  if (value == null || !/^\d+$/.test(value)) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : null;
}

/**
 * Read a pending checkout back out of Stripe metadata. Returns null for
 * metadata that does not describe one, such as sessions created before
 * checkouts moved into metadata or subscriptions from the donation import.
 */
export function parseDonationCheckoutMetadata(
  metadata: Record<string, string> | null | undefined,
): PendingDonationCheckout | null {
  const checkoutId = metadata?.donationCheckoutId;
  const email = metadata?.donationDonorEmail;
  const frequency = metadata?.donationFrequency;
  const baseAmountCents = parseMetadataCents(metadata?.donationBaseAmountCents);
  const feeCoverageCents = parseMetadataCents(
    metadata?.donationFeeCoverageCents,
  );
  if (
    !checkoutId ||
    !email ||
    (frequency !== 'ONE_TIME' && frequency !== 'MONTHLY') ||
    baseAmountCents == null ||
    feeCoverageCents == null
  ) {
    return null;
  }

  return {
    checkoutId,
    email,
    name: metadata.donationDonorName ?? '',
    appUserId: isUuid(metadata.donationAppUserId)
      ? metadata.donationAppUserId
      : null,
    frequency,
    baseAmountCents,
    feeCoverageCents,
  };
}
