import { describe, expect, it, vi } from 'vitest';

vi.mock('@letschurch/db', () => ({ db: {} }));
vi.mock('@/temporal', () => ({ startBackground: vi.fn() }));

import {
  buildAdminDonationEmail,
  buildDonorThankYouEmail,
  type DonationEmailDetails,
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
