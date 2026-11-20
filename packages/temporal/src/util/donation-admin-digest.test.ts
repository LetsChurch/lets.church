import { describe, expect, test } from 'vitest';

import {
  buildDonationAdminDigestEmail,
  type DigestGift,
} from './donation-admin-digest';

const WEB_URL = 'https://lets.church/';
// 8:00 Eastern on Nov 20, less a day.
const DAY = new Date('2026-11-19T13:00:00Z');

function gift(overrides: Partial<DigestGift> = {}): DigestGift {
  return {
    donatedAt: new Date('2026-11-19T20:42:00Z'),
    amountCents: 5_000,
    currency: 'usd',
    status: 'SUCCEEDED',
    frequency: 'ONE_TIME',
    donorName: 'Jane Doe',
    donorEmail: 'jane@example.com',
    newPlan: false,
    ...overrides,
  };
}

describe('buildDonationAdminDigestEmail', () => {
  test('subject counts gifts, totals them, and names new plans', () => {
    const email = buildDonationAdminDigestEmail(
      {
        day: DAY,
        gifts: [
          gift(),
          gift({ amountCents: 2_500, frequency: 'MONTHLY', newPlan: true }),
          gift({ amountCents: 10_000, frequency: 'MONTHLY' }),
        ],
      },
      WEB_URL,
    );
    expect(email.subject).toBe(
      'Gifts for Nov 19: 3 gifts, $175.00 (1 new monthly)',
    );
    expect(email.text).toContain(
      '3 gifts received since the last digest, $175.00 in all.',
    );
    expect(email.text).toContain('New recurring plans: 1 monthly');
    expect(email.text).toContain(
      'https://lets.church/dashboard/admin/donations',
    );
  });

  test('one gift, no plans', () => {
    const email = buildDonationAdminDigestEmail(
      { day: DAY, gifts: [gift()] },
      WEB_URL,
    );
    expect(email.subject).toBe('Gifts for Nov 19: 1 gift, $50.00');
    expect(email.text).not.toContain('New recurring plans');
  });

  test('lists each gift in Eastern time, oldest first, with notes', () => {
    const email = buildDonationAdminDigestEmail(
      {
        day: DAY,
        gifts: [
          gift({
            donatedAt: new Date('2026-11-19T22:10:00Z'),
            frequency: 'YEARLY',
            newPlan: true,
            status: 'REFUNDED',
            donorName: null,
            donorEmail: null,
          }),
          gift(),
        ],
      },
      WEB_URL,
    );
    const lines = email.text.split('\n');
    const first = lines.findIndex((line) => line.includes('Jane Doe'));
    const second = lines.findIndex((line) => line.includes('Unknown donor'));
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(lines[first]).toBe(
      'Nov 19, 3:42 PM EST · $50.00 one-time · Jane Doe <jane@example.com>',
    );
    expect(lines[second]).toBe(
      'Nov 19, 5:10 PM EST · $50.00 yearly · Unknown donor (new plan, refunded since)',
    );
  });

  test('keeps currencies apart in the total', () => {
    const email = buildDonationAdminDigestEmail(
      {
        day: DAY,
        gifts: [gift(), gift({ currency: 'eur', amountCents: 2_000 })],
      },
      WEB_URL,
    );
    expect(email.subject).toBe('Gifts for Nov 19: 2 gifts, $50.00 + €20.00');
  });

  test('escapes donor values in HTML and caps the list', () => {
    const many = Array.from({ length: 105 }, () =>
      gift({ donorName: '<b>Eve</b>' }),
    );
    const email = buildDonationAdminDigestEmail(
      { day: DAY, gifts: many },
      WEB_URL,
    );
    expect(email.html).not.toContain('<b>Eve</b>');
    expect(email.text).toContain('…and 5 more on the donations dashboard.');
    expect(
      email.text.split('\n').filter((l) => l.includes('Eve')),
    ).toHaveLength(100);
  });
});
