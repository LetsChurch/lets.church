import { estimatedCardFeeCents } from './amounts';

type RecurringFrequency = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

// Statuses that count toward scheduled monthly intake. PAST_DUE and
// INCOMPLETE plans may never collect, so they stay out of the public total.
export const BUDGET_SUBSCRIPTION_STATUSES = ['ACTIVE', 'TRIALING'] as const;

const MONTHS_PER_PERIOD: Record<RecurringFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

export type BudgetSubscription = {
  frequency: RecurringFrequency | 'ONE_TIME';
  amountCents: number;
};

export type BudgetSummary = {
  expensesCents: number;
  recurringCents: number;
  untrackedCents: number;
  incomeCents: number;
  differenceCents: number;
};

/**
 * Compares monthly expenses with scheduled monthly intake. `subscriptions`
 * must already be limited to the plans that count (see
 * BUDGET_SUBSCRIPTION_STATUSES). Each plan counts what we keep after the
 * estimated card fee on each charge, so quarterly and yearly plans pay the
 * fixed part once per period before being spread across months.
 */
export function summarizeBudget({
  categories,
  subscriptions,
  untrackedGifts,
}: {
  categories: ReadonlyArray<{ monthlyAmountCents: number }>;
  subscriptions: ReadonlyArray<BudgetSubscription>;
  untrackedGifts: ReadonlyArray<{ monthlyAmountCents: number }>;
}): BudgetSummary {
  let scheduled = 0;
  for (const subscription of subscriptions) {
    if (subscription.frequency === 'ONE_TIME') continue;
    const netCents = Math.max(
      0,
      subscription.amountCents -
        estimatedCardFeeCents(subscription.amountCents),
    );
    scheduled += netCents / MONTHS_PER_PERIOD[subscription.frequency];
  }

  const untrackedCents = untrackedGifts.reduce(
    (total, gift) => total + gift.monthlyAmountCents,
    0,
  );

  const expensesCents = categories.reduce(
    (total, category) => total + category.monthlyAmountCents,
    0,
  );
  const recurringCents = Math.round(scheduled);
  const incomeCents = recurringCents + untrackedCents;

  return {
    expensesCents,
    recurringCents,
    untrackedCents,
    incomeCents,
    differenceCents: incomeCents - expensesCents,
  };
}
