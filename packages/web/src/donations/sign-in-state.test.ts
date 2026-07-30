import { describe, expect, it, vi } from 'vitest';

import {
  donationEmailFromHistoryState,
  rememberDonationCheckoutEmail,
  takeDonationCheckoutEmail,
} from './sign-in-state';

describe('donationEmailFromHistoryState', () => {
  it('returns a valid checkout email', () => {
    expect(
      donationEmailFromHistoryState({
        donationEmail: ' donor@example.com ',
      }),
    ).toBe('donor@example.com');
  });

  it('ignores missing or invalid state', () => {
    expect(donationEmailFromHistoryState(undefined)).toBeUndefined();
    expect(
      donationEmailFromHistoryState({ donationEmail: 'not an email' }),
    ).toBeUndefined();
  });
});

describe('donation checkout email storage', () => {
  it('stores the normalized email under the opaque Checkout Session id', () => {
    const values = new Map<string, string>();
    rememberDonationCheckoutEmail(
      {
        setItem: (key, value) => values.set(key, value),
      },
      'cs_test_123',
      ' Donor@Example.com ',
    );

    expect(values).toEqual(
      new Map([['donation-checkout-email:cs_test_123', 'donor@example.com']]),
    );
  });

  it('returns and removes the email after the Stripe redirect', () => {
    const values = new Map([
      ['donation-checkout-email:cs_test_123', 'donor@example.com'],
    ]);

    expect(
      takeDonationCheckoutEmail(
        {
          getItem: (key) => values.get(key) ?? null,
          removeItem: (key) => values.delete(key),
        },
        'cs_test_123',
      ),
    ).toBe('donor@example.com');
    expect(values.size).toBe(0);
  });

  it('does not persist invalid input', () => {
    const setItem = vi.fn();
    rememberDonationCheckoutEmail({ setItem }, 'cs_test_123', 'not-an-email');
    expect(setItem).not.toHaveBeenCalled();
  });
});
