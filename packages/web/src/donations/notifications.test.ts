import { describe, expect, it, vi } from 'vitest';

vi.mock('@letschurch/db', () => ({ db: {} }));
vi.mock('@/temporal', () => ({ startBackground: vi.fn() }));

import {
  adminGiftLabel,
  buildAdminSubscriptionNoticeEmail,
  buildAdminWebhookFailureEmail,
  buildDonorThankYouEmail,
  type DonationEmailDetails,
  type SubscriptionEmailDetails,
} from './notifications';

const WEB_URL = 'https://lets.church';

const details: DonationEmailDetails = {
  donationId: '00000000-0000-4000-8000-000000000001',
  amountCents: 2_606,
  currency: 'usd',
  frequency: 'MONTHLY',
  donatedAt: new Date('2026-10-01T12:00:00Z'),
  receiptUrl: 'https://pay.stripe.com/receipts/abc',
  donorName: 'Ada <b>Lovelace</b>',
  donorEmail: 'ada@example.com',
};

describe('donation notification emails', () => {
  it('thanks the donor with gift details and the tax statement', () => {
    const email = buildDonorThankYouEmail(details, WEB_URL);
    expect(email.subject).toBe(
      "Receipt for your $26.06 monthly gift to Let's Church",
    );
    expect(email.text).toContain('your monthly gift');
    expect(email.text).toContain('$26.06');
    expect(email.text).toContain('October 1, 2026');
    expect(email.text).toContain(
      'No goods or services were provided in exchange for this contribution.',
    );
    expect(email.text).toContain('https://pay.stripe.com/receipts/abc');
    expect(email.html).toContain('href="https://pay.stripe.com/receipts/abc"');
    expect(email.html).toContain(
      'href="https://lets.church/dashboard/account/donations"',
    );
  });

  it('escapes donor-controlled values in HTML', () => {
    const email = buildDonorThankYouEmail(details, WEB_URL);
    expect(email.html).not.toContain('<b>Lovelace</b>');
  });

  it('drops receipt links that are not http(s)', () => {
    const email = buildDonorThankYouEmail(
      { ...details, receiptUrl: 'javascript:alert(1)', frequency: 'ONE_TIME' },
      WEB_URL,
    );
    expect(email.subject).toBe("Receipt for your $26.06 gift to Let's Church");
    expect(email.text).toContain('your gift');
    expect(email.text).not.toContain('javascript:');
    expect(email.html).not.toContain('javascript:');
  });

  it('falls back to a generic greeting without a donor name', () => {
    const email = buildDonorThankYouEmail(
      { ...details, donorName: null },
      WEB_URL,
    );
    expect(email.text.startsWith('Hello,')).toBe(true);
  });
});

const subscriptionDetails: SubscriptionEmailDetails = {
  subscriptionId: '00000000-0000-4000-8000-000000000002',
  stripeSubscriptionId: 'sub_123',
  amountCents: 2_606,
  currency: 'usd',
  frequency: 'MONTHLY',
  donorName: 'Ada <b>Lovelace</b>',
  donorEmail: 'ada@example.com',
};

describe('admin subject labels', () => {
  it('names the donor, amount, and frequency', () => {
    expect(adminGiftLabel('Jane Doe', '$25.00', 'MONTHLY')).toBe(
      "Jane Doe's $25.00 monthly",
    );
    expect(adminGiftLabel('Jane Doe', '$50.00', 'ONE_TIME')).toBe(
      "Jane Doe's $50.00",
    );
  });

  it('drops a missing name and flattens or caps a long one', () => {
    expect(adminGiftLabel(null, '$25.00', 'YEARLY')).toBe('$25.00 yearly');
    expect(adminGiftLabel('  ', '$25.00', 'YEARLY')).toBe('$25.00 yearly');
    expect(adminGiftLabel('Jane\r\nBcc: x', '$1.00', 'ONE_TIME')).toBe(
      "Jane Bcc: x's $1.00",
    );
    const label = adminGiftLabel('A'.repeat(80), '$1.00', 'ONE_TIME');
    expect(label).toBe(`${'A'.repeat(39)}…'s $1.00`);
  });
});

describe('recurring donation admin notices', () => {
  it('reports a failed payment with the retry schedule', () => {
    const email = buildAdminSubscriptionNoticeEmail(
      {
        kind: 'PAYMENT_FAILED',
        subscriptionId: subscriptionDetails.subscriptionId,
        invoiceId: 'in_123',
        amountCents: 2_606,
        currency: 'usd',
        attemptCount: 2,
        nextAttemptAt: new Date('2026-10-05T12:00:00Z'),
        failureMessage: 'Your card was declined.',
      },
      subscriptionDetails,
      WEB_URL,
    );
    expect(email.subject).toBe(
      "Action needed: Ada <b>Lovelace</b>'s $26.06 monthly charge failed",
    );
    expect(email.text).toContain('Stripe will retry on October 5, 2026.');
    expect(email.text).toContain('Failure reason: Your card was declined.');
    expect(email.text).toContain('Attempt: 2');
    expect(email.text).toContain('Invoice ID: in_123');
    expect(email.text).toContain('Stripe subscription: sub_123');
    expect(email.html).toContain(
      'href="https://lets.church/dashboard/admin/donations"',
    );
    expect(email.html).not.toContain('<b>Lovelace</b>');
  });

  it('says when Stripe will not retry a failed payment', () => {
    const email = buildAdminSubscriptionNoticeEmail(
      {
        kind: 'PAYMENT_FAILED',
        subscriptionId: subscriptionDetails.subscriptionId,
        invoiceId: 'in_123',
        amountCents: 2_606,
        currency: 'usd',
        attemptCount: 4,
        nextAttemptAt: null,
        failureMessage: null,
      },
      subscriptionDetails,
      WEB_URL,
    );
    expect(email.subject).toBe(
      "Action needed: Ada <b>Lovelace</b>'s $26.06 monthly charge failed, no more retries",
    );
    expect(email.text).toContain('Stripe will not retry it automatically.');
    expect(email.text).not.toContain('Failure reason');
  });

  it('reports a scheduled cancellation with donor feedback', () => {
    const email = buildAdminSubscriptionNoticeEmail(
      {
        kind: 'CANCELLATION_SCHEDULED',
        subscriptionId: subscriptionDetails.subscriptionId,
        eventId: 'evt_123',
        cancelAt: new Date('2026-11-01T00:00:00Z'),
        cancellation: {
          reason: 'cancellation_requested',
          feedback: 'too_expensive',
          comment: '<script>x</script>Money is tight',
        },
      },
      subscriptionDetails,
      WEB_URL,
    );
    expect(email.subject).toBe(
      "Ada <b>Lovelace</b>'s $26.06 monthly gift ends Nov 1",
    );
    expect(email.text).toContain('set to cancel on November 1, 2026.');
    expect(email.text).toContain('Reason: Canceled on request');
    expect(email.text).toContain('Donor feedback: Too expensive');
    expect(email.html).not.toContain('<script>');
  });

  it('reports an ended plan', () => {
    const email = buildAdminSubscriptionNoticeEmail(
      {
        kind: 'ENDED',
        subscriptionId: subscriptionDetails.subscriptionId,
        endedAt: new Date('2026-10-20T00:00:00Z'),
        cancellation: {
          reason: 'payment_failed',
          feedback: null,
          comment: null,
        },
      },
      subscriptionDetails,
      WEB_URL,
    );
    expect(email.subject).toBe(
      "Ada <b>Lovelace</b>'s $26.06 monthly gift ended",
    );
    expect(email.text).toContain('ended on October 20, 2026.');
    expect(email.text).toContain('Reason: Payment failed');
    expect(email.text).not.toContain('Donor feedback');
  });
});

describe('webhook failure admin notice', () => {
  it('names the event and keeps markup in the error out of the HTML', () => {
    const email = buildAdminWebhookFailureEmail(
      {
        eventId: 'evt_123',
        eventType: 'invoice.paid',
        message: 'invoice.paid: Checkout <x> was not found',
      },
      WEB_URL,
    );
    expect(email.subject).toBe(
      "Action needed: Stripe event invoice.paid didn't apply",
    );
    expect(email.text).toContain('Event ID: evt_123');
    expect(email.text).toContain(
      'https://lets.church/dashboard/admin/donations',
    );
    expect(email.html).toContain('was not found');
    expect(email.html).not.toContain('<x>');
  });
});
