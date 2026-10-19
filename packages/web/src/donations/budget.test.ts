import { describe, expect, it } from 'vitest';

import { summarizeBudget } from './budget';

describe('donation budget summary', () => {
  it('compares monthly expenses with scheduled monthly gifts', () => {
    expect(
      summarizeBudget({
        categories: [
          { monthlyAmountCents: 40_000 },
          { monthlyAmountCents: 10_000 },
        ],
        subscriptions: [
          { frequency: 'MONTHLY', amountCents: 2_500, budgetOffsetCents: 0 },
          { frequency: 'MONTHLY', amountCents: 10_000, budgetOffsetCents: 0 },
        ],
        untrackedGifts: [],
      }),
    ).toEqual({
      expensesCents: 50_000,
      scheduledCents: 12_500,
      subscriptionOffsetCents: 0,
      recurringCents: 12_500,
      untrackedCents: 0,
      incomeCents: 12_500,
      differenceCents: -37_500,
    });
  });

  it('spreads quarterly and yearly plans across months', () => {
    const summary = summarizeBudget({
      categories: [],
      subscriptions: [
        { frequency: 'QUARTERLY', amountCents: 3_000, budgetOffsetCents: 0 },
        { frequency: 'YEARLY', amountCents: 12_000, budgetOffsetCents: 0 },
        { frequency: 'ONE_TIME', amountCents: 99_999, budgetOffsetCents: 500 },
      ],
      untrackedGifts: [],
    });
    expect(summary.scheduledCents).toBe(2_000);
    expect(summary.subscriptionOffsetCents).toBe(0);
  });

  it('applies each counted plan’s budget offset', () => {
    const summary = summarizeBudget({
      categories: [],
      subscriptions: [
        {
          frequency: 'MONTHLY',
          amountCents: 10_000,
          budgetOffsetCents: -4_000,
        },
        { frequency: 'MONTHLY', amountCents: 5_000, budgetOffsetCents: 1_000 },
      ],
      untrackedGifts: [],
    });
    expect(summary.subscriptionOffsetCents).toBe(-3_000);
    expect(summary.recurringCents).toBe(12_000);
  });

  it('adds untracked gifts to monthly intake', () => {
    const summary = summarizeBudget({
      categories: [{ monthlyAmountCents: 20_000 }],
      subscriptions: [
        { frequency: 'MONTHLY', amountCents: 5_000, budgetOffsetCents: 0 },
      ],
      untrackedGifts: [
        { monthlyAmountCents: 15_000 },
        { monthlyAmountCents: 2_500 },
      ],
    });
    expect(summary.untrackedCents).toBe(17_500);
    expect(summary.incomeCents).toBe(22_500);
    expect(summary.differenceCents).toBe(2_500);
  });
});
