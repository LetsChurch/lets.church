import { describe, expect, it } from 'vitest';

import {
  donationCheckoutMetadata,
  parseDonationCheckoutMetadata,
  type PendingDonationCheckout,
} from './checkout-metadata';

const pending: PendingDonationCheckout = {
  checkoutId: 'a1f2de6c-d737-4fa8-b42c-54b16db4ff74',
  email: 'donor@example.com',
  name: 'Donor',
  appUserId: '6d1f6f1e-37f4-4c4b-9a43-1f1ad3c0e8b2',
  frequency: 'MONTHLY',
  baseAmountCents: 2_500,
  feeCoverageCents: 106,
};

describe('donation checkout metadata', () => {
  it('round-trips a pending checkout through Stripe metadata', () => {
    const metadata = donationCheckoutMetadata(pending);

    expect(Object.values(metadata).every((v) => typeof v === 'string')).toBe(
      true,
    );
    expect(parseDonationCheckoutMetadata(metadata)).toEqual(pending);
  });

  it('ignores an account id that is not a uuid', () => {
    const metadata = {
      ...donationCheckoutMetadata(pending),
      donationAppUserId: 'edited-in-stripe',
    };

    expect(parseDonationCheckoutMetadata(metadata)?.appUserId).toBeNull();
  });

  it('omits empty optional fields, which Stripe would drop', () => {
    const metadata = donationCheckoutMetadata({
      ...pending,
      name: '',
      appUserId: null,
    });

    expect(metadata).not.toHaveProperty('donationDonorName');
    expect(metadata).not.toHaveProperty('donationAppUserId');
    expect(parseDonationCheckoutMetadata(metadata)).toMatchObject({
      name: '',
      appUserId: null,
    });
  });

  it('ignores metadata from older checkouts and imported subscriptions', () => {
    expect(
      parseDonationCheckoutMetadata({
        donationCheckoutId: pending.checkoutId,
        donationDonorId: 'b0b1d6a2-1d5e-4f25-9f6b-0b8f6a4e0c11',
      }),
    ).toBeNull();
    expect(parseDonationCheckoutMetadata({ sourcePlanId: 'plan_1' })).toBe(
      null,
    );
    expect(parseDonationCheckoutMetadata(null)).toBeNull();
  });

  it('rejects malformed amounts and frequencies', () => {
    const metadata = donationCheckoutMetadata(pending);

    expect(
      parseDonationCheckoutMetadata({
        ...metadata,
        donationBaseAmountCents: '25.00',
      }),
    ).toBeNull();
    expect(
      parseDonationCheckoutMetadata({
        ...metadata,
        donationFrequency: 'YEARLY',
      }),
    ).toBeNull();
  });
});
