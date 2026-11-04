import { describe, expect, it, vi } from 'vitest';

vi.mock('@letschurch/db', () => ({ DonationAlert: {} }));

import {
  CHECKOUT_LINK_GRACE_SECONDS,
  CheckoutNotLinkedError,
  shouldAlertWebhookFailure,
  stripeDashboardUrl,
} from './alerts';

describe('stripeDashboardUrl', () => {
  it('links each alerted object to its Stripe page', () => {
    expect(stripeDashboardUrl('pi_123', true)).toBe(
      'https://dashboard.stripe.com/payments/pi_123',
    );
    expect(stripeDashboardUrl('in_123', false)).toBe(
      'https://dashboard.stripe.com/test/invoices/in_123',
    );
    expect(stripeDashboardUrl('evt_123', true)).toBe(
      'https://dashboard.stripe.com/events/evt_123',
    );
  });

  it('has no link for unknown objects', () => {
    expect(stripeDashboardUrl('sub_123', true)).toBeNull();
  });
});

describe('shouldAlertWebhookFailure', () => {
  const now = 1_800_000_000_000;
  const created = now / 1000;

  it('alerts on any other failure right away', () => {
    expect(shouldAlertWebhookFailure(new Error('boom'), created, now)).toBe(
      true,
    );
  });

  it('waits out the grace period for an event that beat its checkout', () => {
    const error = new CheckoutNotLinkedError('not linked');
    expect(shouldAlertWebhookFailure(error, created, now)).toBe(false);
    expect(
      shouldAlertWebhookFailure(
        error,
        created - CHECKOUT_LINK_GRACE_SECONDS,
        now,
      ),
    ).toBe(true);
  });
});
