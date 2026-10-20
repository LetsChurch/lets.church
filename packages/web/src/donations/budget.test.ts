import { describe, expect, it } from 'vitest';

import { summarizeBudget } from './budget';

describe('donation budget summary', () => {
  it('compares monthly expenses with scheduled gifts net of card fees', () => {
    expect(
      summarizeBudget({
        categories: [
          { monthlyAmountCents: 40_000 },
          { monthlyAmountCents: 10_000 },
        ],
        subscriptions: [
          // $25 with fees covered nets back to $25.
          { frequency: 'MONTHLY', amountCents: 2_606 },
          // $100 without fee coverage keeps $96.80.
          { frequency: 'MONTHLY', amountCents: 10_000 },
        ],
        untrackedGifts: [],
      }),
    ).toEqual({
      expensesCents: 50_000,
      recurringCents: 12_180,
      untrackedCents: 0,
      incomeCents: 12_180,
      differenceCents: -37_820,
    });
  });

  it('takes the fee once per charge, then spreads plans across months', () => {
    const summary = summarizeBudget({
      categories: [],
      subscriptions: [
        { frequency: 'QUARTERLY', amountCents: 3_000 },
        { frequency: 'YEARLY', amountCents: 12_000 },
        { frequency: 'ONE_TIME', amountCents: 99_999 },
      ],
      untrackedGifts: [],
    });
    // (3,000 − 117) / 3 + (12,000 − 378) / 12
    expect(summary.recurringCents).toBe(1_930);
  });

  it('adds untracked gifts to monthly intake', () => {
    const summary = summarizeBudget({
      categories: [{ monthlyAmountCents: 20_000 }],
      subscriptions: [{ frequency: 'MONTHLY', amountCents: 5_000 }],
      untrackedGifts: [
        { monthlyAmountCents: 15_000 },
        { monthlyAmountCents: 2_500 },
      ],
    });
    expect(summary.untrackedCents).toBe(17_500);
    expect(summary.incomeCents).toBe(22_325);
    expect(summary.differenceCents).toBe(2_325);
  });
});
