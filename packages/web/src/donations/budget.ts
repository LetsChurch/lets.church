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
  budgetOffsetCents: number;
};

export type BudgetSummary = {
  expensesCents: number;
  scheduledCents: number;
  subscriptionOffsetCents: number;
  recurringCents: number;
  untrackedCents: number;
  incomeCents: number;
  differenceCents: number;
};

/**
 * Compares monthly expenses with scheduled monthly intake. `subscriptions`
 * must already be limited to the plans that count (see
 * BUDGET_SUBSCRIPTION_STATUSES); quarterly and yearly plans are spread across
 * months. A plan's budget offset counts only while the plan does, so a
 * canceled arrangement drops out on its own.
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
  let subscriptionOffsetCents = 0;
  for (const subscription of subscriptions) {
    if (subscription.frequency === 'ONE_TIME') continue;
    scheduled +=
      subscription.amountCents / MONTHS_PER_PERIOD[subscription.frequency];
    subscriptionOffsetCents += subscription.budgetOffsetCents;
  }

  const untrackedCents = untrackedGifts.reduce(
    (total, gift) => total + gift.monthlyAmountCents,
    0,
  );

  const expensesCents = categories.reduce(
    (total, category) => total + category.monthlyAmountCents,
    0,
  );
  const scheduledCents = Math.round(scheduled);
  const recurringCents = scheduledCents + subscriptionOffsetCents;
  const incomeCents = recurringCents + untrackedCents;

  return {
    expensesCents,
    scheduledCents,
    subscriptionOffsetCents,
    recurringCents,
    untrackedCents,
    incomeCents,
    differenceCents: incomeCents - expensesCents,
  };
}
