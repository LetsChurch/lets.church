import { describe, expect, test } from 'vitest';

import {
  buildDonationYearEndStatementEmail,
  type StatementDonation,
  statementGifts,
  statementTotals,
  statementYearRange,
} from './donation-year-end-statement';

function donation(overrides: Partial<StatementDonation>): StatementDonation {
  return {
    amountCents: 5000,
    refundedAmountCents: 0,
    currency: 'usd',
    status: 'SUCCEEDED',
    donatedAt: new Date('2026-03-01T12:00:00Z'),
    ...overrides,
  };
}

describe('statementYearRange', () => {
  test('covers the UTC calendar year, end exclusive', () => {
    const { start, end } = statementYearRange(2026);
    expect(start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('statementGifts', () => {
  test('nets refunds, drops fully refunded and non-final gifts, sorts by date', () => {
    const gifts = statementGifts([
      donation({ donatedAt: new Date('2026-06-01T00:00:00Z') }),
      donation({
        donatedAt: new Date('2026-02-01T00:00:00Z'),
        status: 'PARTIALLY_REFUNDED',
        refundedAmountCents: 2000,
      }),
      donation({ status: 'REFUNDED', refundedAmountCents: 5000 }),
      donation({ status: 'PENDING' }),
      donation({ status: 'FAILED' }),
      donation({ status: 'DISPUTED' }),
    ]);

    expect(gifts).toEqual([
      {
        donatedAt: new Date('2026-02-01T00:00:00Z'),
        amountCents: 3000,
        currency: 'usd',
      },
      {
        donatedAt: new Date('2026-06-01T00:00:00Z'),
        amountCents: 5000,
        currency: 'usd',
      },
    ]);
  });
});

describe('statementTotals', () => {
  test('totals per currency', () => {
    expect(
      statementTotals([
        { donatedAt: new Date(), amountCents: 1000, currency: 'usd' },
        { donatedAt: new Date(), amountCents: 700, currency: 'cad' },
        { donatedAt: new Date(), amountCents: 2500, currency: 'usd' },
      ]),
    ).toEqual([
      { currency: 'usd', amountCents: 3500 },
      { currency: 'cad', amountCents: 700 },
    ]);
  });
});

describe('buildDonationYearEndStatementEmail', () => {
  const gifts = statementGifts([
    donation({ donatedAt: new Date('2026-01-15T00:00:00Z') }),
    donation({
      donatedAt: new Date('2026-12-31T23:30:00Z'),
      amountCents: 12345,
    }),
  ]);

  test('summarizes the year with total, gifts, tax statement, and link', () => {
    const email = buildDonationYearEndStatementEmail(
      { year: 2026, donorName: ' Jane Doe ', gifts },
      'https://lets.church/',
    );

    expect(email.subject).toBe("Your 2026 giving statement from Let's Church");
    expect(email.text).toContain('Dear Jane Doe,');
    expect(email.text).toContain('Total given in 2026: $173.45 (2 gifts)');
    expect(email.text).toContain('January 15, 2026: $50.00');
    expect(email.text).toContain('December 31, 2026: $123.45');
    expect(email.text).toContain(
      'No goods or services were provided in exchange for these contributions.',
    );
    expect(email.text).toContain('EIN 92-3744006');
    expect(email.text).toContain(
      'https://lets.church/dashboard/account/donations/2026',
    );
    expect(email.text).toContain('In Christ,');
    expect(email.html).toContain(
      'href="https://lets.church/dashboard/account/donations/2026"',
    );
  });

  test('plain-text body is flush left with one line per gift', () => {
    const { text } = buildDonationYearEndStatementEmail(
      { year: 2026, donorName: 'Jane', gifts },
      'https://lets.church',
    );
    const lines = text.split('\n');
    expect(lines.filter((line) => /^\s+\S/.test(line))).toEqual([]);
    expect(lines.slice(0, 7)).toEqual([
      'Dear Jane,',
      '',
      expect.stringContaining('Thank you for supporting'),
      '',
      'Total given in 2026: $173.45 (2 gifts)',
      '',
      'January 15, 2026: $50.00',
    ]);
    expect(lines[7]).toBe('December 31, 2026: $123.45');
  });

  test('falls back to a generic greeting and escapes the donor name', () => {
    expect(
      buildDonationYearEndStatementEmail(
        { year: 2026, donorName: null, gifts: gifts.slice(0, 1) },
        'https://lets.church',
      ).text,
    ).toContain('Hello,');

    const email = buildDonationYearEndStatementEmail(
      { year: 2026, donorName: '<script>x</script>Jane', gifts },
      'https://lets.church',
    );
    expect(email.html).not.toContain('<script>');
  });

  test('uses singular wording for one gift', () => {
    expect(
      buildDonationYearEndStatementEmail(
        { year: 2026, donorName: null, gifts: gifts.slice(0, 1) },
        'https://lets.church',
      ).text,
    ).toContain('(one gift)');
  });
});
