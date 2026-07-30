import { DonationDonor, DonationSubscription, db } from '@letschurch/db';
import { eq, or } from 'drizzle-orm';
import type Stripe from 'stripe';

import {
  type PreparedRecurringPlan,
  stripeRecurringInterval,
} from './import-recurring';
import { getStripe } from './stripe-client';

function stripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function subscriptionFrequency(subscription: Stripe.Subscription) {
  const recurring = subscription.items.data[0]?.price.recurring;
  const count = recurring?.interval_count ?? 1;
  if (recurring?.interval === 'month' && count === 1) return 'MONTHLY';
  if (recurring?.interval === 'month' && count === 3) return 'QUARTERLY';
  if (recurring?.interval === 'year' && count === 1) return 'YEARLY';
  throw new Error(
    `Stripe subscription ${subscription.id} has an unsupported billing interval.`,
  );
}

function validateExistingSubscription(
  plan: PreparedRecurringPlan,
  subscription: Stripe.Subscription,
) {
  const item = subscription.items.data[0];
  if (stripeId(subscription.customer) !== plan.destinationCustomerId) {
    throw new Error(
      `Recurring plan ${plan.sourcePlanId} has a Stripe subscription on the wrong customer.`,
    );
  }
  if (
    !item ||
    item.price.unit_amount !== plan.amountCents ||
    (item.quantity ?? 1) !== 1
  ) {
    throw new Error(
      `Recurring plan ${plan.sourcePlanId} has a Stripe subscription with the wrong amount.`,
    );
  }
  if (subscriptionFrequency(subscription) !== plan.frequency) {
    throw new Error(
      `Recurring plan ${plan.sourcePlanId} has a Stripe subscription with the wrong frequency.`,
    );
  }
}

async function validatePaymentSource(
  stripe: Stripe,
  customerId: string,
  sourceId: string,
) {
  if (sourceId.startsWith('pm_')) {
    const paymentMethod = await stripe.paymentMethods.retrieve(sourceId);
    if (stripeId(paymentMethod.customer) !== customerId) {
      throw new Error(
        `Stripe payment method ${sourceId} is not attached to ${customerId}.`,
      );
    }
    return;
  }
  const source = await stripe.customers.retrieveSource(customerId, sourceId);
  if ('deleted' in source && source.deleted) {
    throw new Error(`Stripe payment source ${sourceId} was deleted.`);
  }
  if (source.id !== sourceId) {
    throw new Error(
      `Stripe payment source ${sourceId} is not attached to ${customerId}.`,
    );
  }
}

async function subscriptionsByPlan(stripe: Stripe, customerId: string) {
  const result = new Map<string, Stripe.Subscription[]>();
  for await (const subscription of stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  })) {
    const planId = subscription.metadata.sourcePlanId;
    if (!planId) continue;
    result.set(planId, [...(result.get(planId) ?? []), subscription]);
  }
  return result;
}

async function migrationProduct(stripe: Stripe) {
  for await (const product of stripe.products.list({
    active: true,
    limit: 100,
  })) {
    if (product.metadata.donationMigrationProduct === 'true') return product;
  }
  return stripe.products.create(
    {
      name: "Recurring donation to Let's Church",
      metadata: { donationMigrationProduct: 'true' },
    },
    { idempotencyKey: 'donation-import-product-v1' },
  );
}

type ExistingDonor = {
  id: string;
  email: string | null;
  name: string | null;
  stripeCustomerId: string | null;
};

type PreflightPlan = {
  plan: PreparedRecurringPlan;
  donor: ExistingDonor | null;
  localSubscriptionId: string | null;
  stripeSubscription: Stripe.Subscription | null;
};

export type RecurringPlanApplyResult = {
  mode: 'live' | 'test' | 'empty';
  createdCount: number;
  recoveredCount: number;
  duplicateCount: number;
};

export async function applyRecurringPlanImport(
  plans: PreparedRecurringPlan[],
  options: {
    liveConfirmed: boolean;
    onProgress?: (progress: {
      createdCount: number;
      recoveredCount: number;
      duplicateCount: number;
    }) => Promise<void>;
  },
): Promise<RecurringPlanApplyResult> {
  if (plans.length === 0) {
    return {
      mode: 'empty',
      createdCount: 0,
      recoveredCount: 0,
      duplicateCount: 0,
    };
  }

  const stripe = getStripe();
  const customers = new Map<string, Stripe.Customer>();
  const sourceChecks = new Map<string, Promise<void>>();
  const subscriptionLists = new Map<
    string,
    Promise<Map<string, Stripe.Subscription[]>>
  >();
  const donorLookups = new Map<string, Promise<ExistingDonor | null>>();
  const preflight: PreflightPlan[] = [];

  for (const plan of plans) {
    let customer = customers.get(plan.destinationCustomerId);
    if (!customer) {
      const retrieved = await stripe.customers.retrieve(
        plan.destinationCustomerId,
      );
      if (retrieved.deleted) {
        throw new Error(
          `Stripe customer ${plan.destinationCustomerId} was deleted.`,
        );
      }
      customer = retrieved;
      customers.set(customer.id, customer);
    }

    const sourceKey = `${plan.destinationCustomerId}\u0000${plan.destinationPaymentSourceId}`;
    let sourceCheck = sourceChecks.get(sourceKey);
    if (!sourceCheck) {
      sourceCheck = validatePaymentSource(
        stripe,
        plan.destinationCustomerId,
        plan.destinationPaymentSourceId,
      );
      sourceChecks.set(sourceKey, sourceCheck);
    }
    await sourceCheck;

    let customerSubscriptions = subscriptionLists.get(
      plan.destinationCustomerId,
    );
    if (!customerSubscriptions) {
      customerSubscriptions = subscriptionsByPlan(
        stripe,
        plan.destinationCustomerId,
      );
      subscriptionLists.set(plan.destinationCustomerId, customerSubscriptions);
    }
    const matches = (await customerSubscriptions).get(plan.sourcePlanId);
    if (matches && matches.length > 1) {
      throw new Error(
        `Recurring plan ${plan.sourcePlanId} has multiple Stripe subscriptions.`,
      );
    }
    const stripeSubscription = matches?.[0] ?? null;
    if (stripeSubscription) {
      validateExistingSubscription(plan, stripeSubscription);
    }

    const legacyExternalId = `import:plan:${plan.sourcePlanId}`;
    const localSubscription = await db.query.DonationSubscription.findFirst({
      where: (table, { eq }) => eq(table.legacyExternalId, legacyExternalId),
      columns: { id: true },
    });

    const donorKey = `${plan.email}\u0000${plan.destinationCustomerId}`;
    let donorLookup = donorLookups.get(donorKey);
    if (!donorLookup) {
      donorLookup = db
        .select({
          id: DonationDonor.id,
          email: DonationDonor.email,
          name: DonationDonor.name,
          stripeCustomerId: DonationDonor.stripeCustomerId,
        })
        .from(DonationDonor)
        .where(
          or(
            eq(DonationDonor.email, plan.email),
            eq(DonationDonor.stripeCustomerId, plan.destinationCustomerId),
          ),
        )
        .then((rows) => {
          if (rows.length > 1) {
            throw new Error(
              `Recurring plan ${plan.sourcePlanId} matches two donor records.`,
            );
          }
          const donor = rows[0] ?? null;
          if (donor?.email && donor.email.toLowerCase() !== plan.email) {
            throw new Error(
              `Recurring plan ${plan.sourcePlanId} conflicts with a donor email.`,
            );
          }
          return donor;
        });
      donorLookups.set(donorKey, donorLookup);
    }

    preflight.push({
      plan,
      donor: await donorLookup,
      localSubscriptionId: localSubscription?.id ?? null,
      stripeSubscription,
    });
  }

  const hasLive = [...customers.values()].some((customer) => customer.livemode);
  const hasTest = [...customers.values()].some(
    (customer) => !customer.livemode,
  );
  if (hasLive && hasTest) {
    throw new Error('The copied Stripe customers mix live and test modes.');
  }
  if (hasLive && !options.liveConfirmed) {
    throw new Error(
      'These are live Stripe customers. Confirm the live migration after reviewing the validation results.',
    );
  }

  const needsCreation = preflight.some(
    (entry) => !entry.localSubscriptionId && !entry.stripeSubscription,
  );
  const product = needsCreation ? await migrationProduct(stripe) : null;
  const donors = new Map<string, ExistingDonor>();
  let createdCount = 0;
  let recoveredCount = 0;
  let duplicateCount = 0;

  for (const entry of preflight) {
    if (entry.localSubscriptionId) {
      duplicateCount += 1;
      await options.onProgress?.({
        createdCount,
        recoveredCount,
        duplicateCount,
      });
      continue;
    }
    const { plan } = entry;
    const donorKey = `${plan.email}\u0000${plan.destinationCustomerId}`;
    let donor = donors.get(donorKey);
    if (!donor) {
      if (entry.donor) {
        const [updated] = await db
          .update(DonationDonor)
          .set({
            email: plan.email,
            name: entry.donor.name ?? plan.name,
            stripeCustomerId: plan.destinationCustomerId,
            updatedAt: new Date(),
          })
          .where(eq(DonationDonor.id, entry.donor.id))
          .returning({
            id: DonationDonor.id,
            email: DonationDonor.email,
            name: DonationDonor.name,
            stripeCustomerId: DonationDonor.stripeCustomerId,
          });
        if (!updated) {
          throw new Error(
            `Failed to update the donor for recurring plan ${plan.sourcePlanId}.`,
          );
        }
        donor = updated;
      } else {
        const [inserted] = await db
          .insert(DonationDonor)
          .values({
            email: plan.email,
            name: plan.name,
            stripeCustomerId: plan.destinationCustomerId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: DonationDonor.email,
            set: {
              stripeCustomerId: plan.destinationCustomerId,
              updatedAt: new Date(),
            },
          })
          .returning({
            id: DonationDonor.id,
            email: DonationDonor.email,
            name: DonationDonor.name,
            stripeCustomerId: DonationDonor.stripeCustomerId,
          });
        if (!inserted) {
          throw new Error(
            `Failed to create the donor for recurring plan ${plan.sourcePlanId}.`,
          );
        }
        donor = inserted;
      }
      donors.set(donorKey, donor);
    }

    let subscription = entry.stripeSubscription;
    if (!subscription) {
      if (!product) throw new Error('Migration product was not created.');
      const paymentSource = plan.destinationPaymentSourceId.startsWith('pm_')
        ? { default_payment_method: plan.destinationPaymentSourceId }
        : { default_source: plan.destinationPaymentSourceId };
      subscription = await stripe.subscriptions.create(
        {
          customer: plan.destinationCustomerId,
          items: [
            {
              quantity: 1,
              price_data: {
                currency: plan.currency,
                product: product.id,
                recurring: stripeRecurringInterval(plan.frequency),
                unit_amount: plan.amountCents,
              },
            },
          ],
          ...paymentSource,
          collection_method: 'charge_automatically',
          description: `Recurring donation to Let's Church Inc.`,
          metadata: {
            donationMigration: 'admin-import',
            donationDonorId: donor.id,
            sourcePlanId: plan.sourcePlanId,
            donationBaseAmountCents: String(plan.baseAmountCents),
            donationFeeCoverageCents: String(plan.feeCoverageCents),
          },
          proration_behavior: 'none',
          trial_end: Math.floor(plan.nextBillAt.getTime() / 1000),
        },
        { idempotencyKey: `donation-import-plan-${plan.sourcePlanId}` },
      );
      createdCount += 1;
    } else {
      recoveredCount += 1;
    }

    const item = subscription.items.data[0];
    const customerId = stripeId(subscription.customer);
    if (!item?.price.unit_amount || !customerId) {
      throw new Error(
        `Stripe subscription ${subscription.id} is missing billing data.`,
      );
    }
    const values = {
      donorId: donor.id,
      checkoutId: null,
      legacyExternalId: `import:plan:${plan.sourcePlanId}`,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: item.price.id,
      frequency: plan.frequency,
      status:
        subscription.status.toUpperCase() as typeof DonationSubscription.$inferInsert.status,
      baseAmountCents: plan.baseAmountCents,
      feeCoverageCents: plan.feeCoverageCents,
      amountCents: item.price.unit_amount * (item.quantity ?? 1),
      currency: item.price.currency,
      currentPeriodStart: new Date(item.current_period_start * 1000),
      currentPeriodEnd: new Date(item.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
      endedAt: subscription.ended_at
        ? new Date(subscription.ended_at * 1000)
        : null,
      updatedAt: new Date(),
    } satisfies typeof DonationSubscription.$inferInsert;
    await db.insert(DonationSubscription).values(values).onConflictDoUpdate({
      target: DonationSubscription.stripeSubscriptionId,
      set: values,
    });
    await options.onProgress?.({
      createdCount,
      recoveredCount,
      duplicateCount,
    });
  }

  return {
    mode: hasLive ? 'live' : 'test',
    createdCount,
    recoveredCount,
    duplicateCount,
  };
}
