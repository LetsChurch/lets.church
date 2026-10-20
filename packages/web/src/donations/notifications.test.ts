import { describe, expect, it, vi } from 'vitest';

vi.mock('@letschurch/db', () => ({ db: {} }));
vi.mock('@/temporal', () => ({ startBackground: vi.fn() }));

import {
  buildAdminDonationEmail,
  buildAdminSubscriptionNoticeEmail,
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
    expect(email.subject).toBe("Thank you for supporting Let's Church");
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

  it('summarizes the donation for the site admin', () => {
    const email = buildAdminDonationEmail(details, WEB_URL);
    expect(email.subject).toBe('New monthly donation: $26.06');
    expect(email.text).toContain('Donor email: ada@example.com');
    expect(email.text).toContain(`Donation ID: ${details.donationId}`);
    expect(email.html).toContain(
      'href="https://lets.church/dashboard/admin/donations"',
    );
    expect(email.html).not.toContain('<b>Lovelace</b>');
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
    expect(email.subject).toBe('Monthly donation payment failed: $26.06');
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
    expect(email.subject).toBe('Monthly donation set to cancel: $26.06');
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
    expect(email.subject).toBe('Monthly donation canceled: $26.06');
    expect(email.text).toContain('ended on October 20, 2026.');
    expect(email.text).toContain('Reason: Payment failed');
    expect(email.text).not.toContain('Donor feedback');
  });
});
