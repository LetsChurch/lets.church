import {
  Donation,
  DonationCheckout,
  DonationPaymentAdjustment,
  DonationSubscription,
  DonationWebhookEvent,
  db,
  type TransactionClient,
} from '@letschurch/db';
import { eq, or } from 'drizzle-orm';
import type Stripe from 'stripe';

import logger from '@/util/logger';

import {
  resolveCheckoutDonationStatus,
  resolveDonationAdjustmentStatus,
  resolveSubscriptionAmounts,
  stripeInvoiceExpand,
} from './reconciliation';
import { getStripe } from './stripe-client';

const moduleLogger = logger.child({
  module: 'donations/webhooks',
});

type PreparedEvent = {
  session?: Stripe.Checkout.Session;
  invoice?: Stripe.Invoice;
  subscription?: Stripe.Subscription;
  charge?: Stripe.Charge;
  dispute?: Stripe.Dispute;
};

function stripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  return stripeId(invoice.parent?.subscription_details?.subscription);
}

async function prepareEvent(event: Stripe.Event): Promise<PreparedEvent> {
  const stripe = getStripe();

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded' ||
    event.type === 'checkout.session.async_payment_failed' ||
    event.type === 'checkout.session.expired'
  ) {
    const session = await stripe.checkout.sessions.retrieve(
      event.data.object.id,
      {
        expand: ['payment_intent.latest_charge', 'subscription'],
      },
    );
    return {
      session,
      subscription:
        session.subscription && typeof session.subscription === 'object'
          ? session.subscription
          : undefined,
    };
  }

  if (
    event.type === 'invoice.paid' ||
    event.type === 'invoice.payment_failed'
  ) {
    const invoice = await stripe.invoices.retrieve(event.data.object.id, {
      expand: [...stripeInvoiceExpand],
    });
    const subscriptionId = invoiceSubscriptionId(invoice);
    return {
      invoice,
      subscription: subscriptionId
        ? await stripe.subscriptions.retrieve(subscriptionId)
        : undefined,
    };
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    return {
      subscription: await stripe.subscriptions.retrieve(event.data.object.id),
    };
  }

  if (event.type === 'charge.refunded') {
    return {
      charge: await stripe.charges.retrieve(event.data.object.id),
    };
  }

  if (
    event.type === 'charge.dispute.created' ||
    event.type === 'charge.dispute.updated' ||
    event.type === 'charge.dispute.closed'
  ) {
    return {
      dispute: await stripe.disputes.retrieve(event.data.object.id),
    };
  }

  return {};
}

export async function reconcileStripeCheckoutSession(sessionId: string) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent.latest_charge', 'subscription'],
  });
  if (session.status === 'open') return;

  const subscription =
    session.subscription && typeof session.subscription === 'object'
      ? session.subscription
      : undefined;
  const latestInvoiceId = subscription
    ? stripeId(subscription.latest_invoice)
    : null;
  const invoice = latestInvoiceId
    ? await stripe.invoices.retrieve(latestInvoiceId, {
        expand: [...stripeInvoiceExpand],
      })
    : null;

  await db.transaction(async (tx) => {
    await applyCheckoutSession(
      tx,
      session.status === 'expired'
        ? 'checkout.session.expired'
        : 'checkout.session.completed',
      session,
      subscription,
    );
    if (invoice?.status === 'paid' && subscription) {
      await applyPaidInvoice(tx, invoice, subscription);
    }
  });
}

function subscriptionStatus(
  status: Stripe.Subscription.Status,
): typeof DonationSubscription.$inferInsert.status {
  return status.toUpperCase() as typeof DonationSubscription.$inferInsert.status;
}

function subscriptionFrequency(
  subscription: Stripe.Subscription,
): typeof DonationSubscription.$inferInsert.frequency {
  const recurring = subscription.items.data[0]?.price.recurring;
  const intervalCount = recurring?.interval_count ?? 1;
  if (recurring?.interval === 'month' && intervalCount === 1) {
    return 'MONTHLY';
  }
  if (recurring?.interval === 'month' && intervalCount === 3) {
    return 'QUARTERLY';
  }
  if (recurring?.interval === 'year' && intervalCount === 1) {
    return 'YEARLY';
  }
  throw new Error(
    `Unsupported billing interval on subscription ${subscription.id}`,
  );
}

function metadataCents(
  input: string | undefined,
  field: string,
  subscriptionId: string,
) {
  if (input == null) return null;
  if (!/^\d+$/.test(input)) {
    throw new Error(
      `Invalid ${field} metadata on subscription ${subscriptionId}`,
    );
  }
  const result = Number(input);
  if (!Number.isSafeInteger(result)) {
    throw new Error(
      `Invalid ${field} metadata on subscription ${subscriptionId}`,
    );
  }
  return result;
}

async function upsertSubscription(
  tx: TransactionClient,
  subscription: Stripe.Subscription,
) {
  const checkoutId = subscription.metadata.donationCheckoutId || null;
  const checkout = checkoutId
    ? await tx.query.DonationCheckout.findFirst({
        where: (table, { eq }) => eq(table.id, checkoutId),
      })
    : null;
  const existing = await tx.query.DonationSubscription.findFirst({
    where: (table, { eq }) => eq(table.stripeSubscriptionId, subscription.id),
  });
  const donorId =
    checkout?.donorId ??
    existing?.donorId ??
    subscription.metadata.donationDonorId;
  if (!donorId) {
    moduleLogger.warn(
      {
        context: {
          subscriptionId: subscription.id,
          customerId: stripeId(subscription.customer),
          checkoutId,
        },
      },
      'Stripe subscription did not resolve to a donation donor',
    );
    return null;
  }

  const item = subscription.items.data[0];
  if (!item?.price.unit_amount) {
    throw new Error(`No fixed price found for subscription ${subscription.id}`);
  }

  const amountCents = item.price.unit_amount * (item.quantity ?? 1);
  const metadataBaseAmountCents = metadataCents(
    subscription.metadata.donationBaseAmountCents,
    'donationBaseAmountCents',
    subscription.id,
  );
  const metadataFeeCoverageCents = metadataCents(
    subscription.metadata.donationFeeCoverageCents,
    'donationFeeCoverageCents',
    subscription.id,
  );
  const { baseAmountCents, feeCoverageCents } = resolveSubscriptionAmounts(
    amountCents,
    [
      checkout
        ? {
            baseAmountCents: checkout.baseAmountCents,
            feeCoverageCents: checkout.feeCoverageCents,
          }
        : null,
      existing
        ? {
            baseAmountCents: existing.baseAmountCents,
            feeCoverageCents: existing.feeCoverageCents,
          }
        : null,
      metadataBaseAmountCents == null || metadataFeeCoverageCents == null
        ? null
        : {
            baseAmountCents: metadataBaseAmountCents,
            feeCoverageCents: metadataFeeCoverageCents,
          },
    ],
  );
  const customerId = stripeId(subscription.customer);
  if (!customerId) {
    throw new Error(`No customer found for subscription ${subscription.id}`);
  }
  const sourcePlanId = subscription.metadata.sourcePlanId;

  const values = {
    donorId,
    checkoutId: checkout?.id ?? existing?.checkoutId ?? null,
    legacyExternalId:
      existing?.legacyExternalId ??
      (sourcePlanId ? `import:plan:${sourcePlanId}` : null),
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    stripePriceId: item.price.id,
    frequency: subscriptionFrequency(subscription),
    status: subscriptionStatus(subscription.status),
    baseAmountCents,
    feeCoverageCents,
    amountCents,
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

  const [row] = await tx
    .insert(DonationSubscription)
    .values(values)
    .onConflictDoUpdate({
      target: DonationSubscription.stripeSubscriptionId,
      set: values,
    })
    .returning();

  if (!row) {
    throw new Error(`Failed to store subscription ${subscription.id}`);
  }

  return row;
}

function paymentDetailsFromSession(session: Stripe.Checkout.Session) {
  const intent =
    typeof session.payment_intent === 'object' ? session.payment_intent : null;
  const charge =
    intent && typeof intent.latest_charge === 'object'
      ? intent.latest_charge
      : null;

  return {
    paymentIntentId: stripeId(session.payment_intent),
    chargeId: charge?.id ?? stripeId(intent?.latest_charge),
    receiptUrl: charge?.receipt_url ?? null,
    chargeCreatedAt: charge?.created ? new Date(charge.created * 1000) : null,
  };
}

function statusAfterAdjustment(
  donation: typeof Donation.$inferSelect,
  adjustment: typeof DonationPaymentAdjustment.$inferSelect,
): typeof Donation.$inferInsert.status {
  const disputeStatus = adjustment.disputeStatus ?? donation.disputeStatus;
  const refundedAmountCents =
    adjustment.refundedAmountCents ?? donation.refundedAmountCents;
  return resolveDonationAdjustmentStatus({
    amountCents: donation.amountCents,
    refundedAmountCents,
    disputeStatus,
  });
}

async function applyAdjustmentToDonation(
  tx: TransactionClient,
  donation: typeof Donation.$inferSelect,
  adjustment: typeof DonationPaymentAdjustment.$inferSelect,
) {
  await tx
    .update(Donation)
    .set({
      refundedAmountCents:
        adjustment.refundedAmountCents ?? donation.refundedAmountCents,
      disputeStatus: adjustment.disputeStatus ?? donation.disputeStatus,
      status: statusAfterAdjustment(donation, adjustment),
      updatedAt: new Date(),
    })
    .where(eq(Donation.id, donation.id));
}

async function applyAdjustmentToMatchingDonation(
  tx: TransactionClient,
  adjustment: typeof DonationPaymentAdjustment.$inferSelect,
) {
  const paymentIntentId = adjustment.stripePaymentIntentId;
  const donation = await tx.query.Donation.findFirst({
    where: paymentIntentId
      ? or(
          eq(Donation.stripeChargeId, adjustment.stripeChargeId),
          eq(Donation.stripePaymentIntentId, paymentIntentId),
        )
      : eq(Donation.stripeChargeId, adjustment.stripeChargeId),
  });
  if (donation) {
    await applyAdjustmentToDonation(tx, donation, adjustment);
  }
}

async function reconcileDonationAdjustment(
  tx: TransactionClient,
  donation: typeof Donation.$inferSelect,
) {
  if (!donation.stripeChargeId && !donation.stripePaymentIntentId) return;
  const chargeAdjustment = donation.stripeChargeId
    ? await tx.query.DonationPaymentAdjustment.findFirst({
        where: (table, { eq }) =>
          eq(table.stripeChargeId, donation.stripeChargeId!),
      })
    : null;
  const adjustment =
    chargeAdjustment ??
    (donation.stripePaymentIntentId
      ? await tx.query.DonationPaymentAdjustment.findFirst({
          where: (table, { eq }) =>
            eq(table.stripePaymentIntentId, donation.stripePaymentIntentId!),
        })
      : null);
  if (adjustment) {
    await applyAdjustmentToDonation(tx, donation, adjustment);
  }
}

async function applyCheckoutSession(
  tx: TransactionClient,
  eventType: Stripe.Event.Type,
  session: Stripe.Checkout.Session,
  subscription?: Stripe.Subscription,
) {
  const checkoutId =
    session.metadata?.donationCheckoutId ?? session.client_reference_id;
  if (!checkoutId) return;

  const checkout = await tx.query.DonationCheckout.findFirst({
    where: (table, { eq }) => eq(table.id, checkoutId),
  });
  if (!checkout) {
    if (session.metadata?.donationCheckoutId) {
      throw new Error(`Donation checkout ${checkoutId} was not found`);
    }
    return;
  }
  if (
    checkout.stripeCheckoutSessionId &&
    checkout.stripeCheckoutSessionId !== session.id
  ) {
    throw new Error(`Checkout ${checkoutId} has a different Stripe session`);
  }
  if (
    session.amount_total != null &&
    session.amount_total !== checkout.amountCents
  ) {
    throw new Error(`Checkout ${checkoutId} amount does not match Stripe`);
  }

  if (eventType === 'checkout.session.expired') {
    await tx
      .update(DonationCheckout)
      .set({ status: 'EXPIRED', updatedAt: new Date() })
      .where(eq(DonationCheckout.id, checkout.id));
    return;
  }

  await tx
    .update(DonationCheckout)
    .set({
      status: 'COMPLETED',
      completedAt: new Date(),
      stripeCheckoutSessionId: session.id,
      updatedAt: new Date(),
    })
    .where(eq(DonationCheckout.id, checkout.id));

  if (session.mode === 'subscription') {
    if (!subscription) {
      throw new Error(`Checkout ${session.id} has no expanded subscription`);
    }
    await upsertSubscription(tx, subscription);
    return;
  }

  const payment = paymentDetailsFromSession(session);
  const paymentIntent =
    typeof session.payment_intent === 'object' ? session.payment_intent : null;
  const status = resolveCheckoutDonationStatus({
    eventType,
    paymentStatus: session.payment_status,
    paymentIntentStatus: paymentIntent?.status ?? null,
  });
  const values = {
    donorId: checkout.donorId,
    checkoutId: checkout.id,
    source: 'STRIPE' as const,
    externalId: `stripe:checkout:${session.id}`,
    frequency: 'ONE_TIME' as const,
    status,
    baseAmountCents: checkout.baseAmountCents,
    feeCoverageCents: checkout.feeCoverageCents,
    amountCents: checkout.amountCents,
    currency: checkout.currency,
    stripePaymentIntentId: payment.paymentIntentId,
    stripeChargeId: payment.chargeId,
    receiptUrl: payment.receiptUrl,
    donatedAt: payment.chargeCreatedAt ?? new Date(session.created * 1000),
    updatedAt: new Date(),
  } satisfies typeof Donation.$inferInsert;

  const [donation] = await tx
    .insert(Donation)
    .values(values)
    .onConflictDoUpdate({
      target: Donation.externalId,
      set: values,
    })
    .returning();
  if (donation) {
    await reconcileDonationAdjustment(tx, donation);
  }
}

function invoicePaymentDetails(invoice: Stripe.Invoice) {
  const invoicePayment = invoice.payments?.data.find(
    (payment) => payment.status === 'paid',
  );
  const intentValue = invoicePayment?.payment.payment_intent;
  const intent = typeof intentValue === 'object' ? intentValue : null;
  const charge =
    intent && typeof intent.latest_charge === 'object'
      ? intent.latest_charge
      : null;

  return {
    paymentIntentId: stripeId(intentValue),
    chargeId:
      charge?.id ??
      stripeId(intent?.latest_charge) ??
      stripeId(invoicePayment?.payment.charge),
  };
}

async function applyPaidInvoice(
  tx: TransactionClient,
  invoice: Stripe.Invoice,
  stripeSubscription: Stripe.Subscription,
) {
  const subscription = await upsertSubscription(tx, stripeSubscription);
  if (!subscription) return;
  if (invoice.amount_paid <= 0) return;

  const usesExpectedAmount = invoice.amount_paid === subscription.amountCents;
  const payment = invoicePaymentDetails(invoice);
  const values = {
    donorId: subscription.donorId,
    subscriptionId: subscription.id,
    checkoutId: subscription.checkoutId,
    source: 'STRIPE' as const,
    externalId: `stripe:invoice:${invoice.id}`,
    frequency: subscription.frequency,
    status: 'SUCCEEDED' as const,
    baseAmountCents: usesExpectedAmount
      ? subscription.baseAmountCents
      : invoice.amount_paid,
    feeCoverageCents: usesExpectedAmount ? subscription.feeCoverageCents : 0,
    amountCents: invoice.amount_paid,
    currency: invoice.currency,
    stripePaymentIntentId: payment.paymentIntentId,
    stripeChargeId: payment.chargeId,
    stripeInvoiceId: invoice.id,
    receiptUrl: invoice.hosted_invoice_url ?? null,
    donatedAt: new Date(
      (invoice.status_transitions.paid_at ?? invoice.created) * 1000,
    ),
    updatedAt: new Date(),
  } satisfies typeof Donation.$inferInsert;

  const [donation] = await tx
    .insert(Donation)
    .values(values)
    .onConflictDoUpdate({
      target: Donation.externalId,
      set: values,
    })
    .returning();
  if (donation) {
    await reconcileDonationAdjustment(tx, donation);
  }

  await tx
    .update(DonationSubscription)
    .set({ lastPaymentFailedAt: null, updatedAt: new Date() })
    .where(eq(DonationSubscription.id, subscription.id));
}

async function applyFailedInvoice(
  tx: TransactionClient,
  invoice: Stripe.Invoice,
  stripeSubscription: Stripe.Subscription,
  failedAt: Date,
) {
  const subscription = await upsertSubscription(tx, stripeSubscription);
  if (!subscription) return;
  const newerSuccessfulDonation = await tx.query.Donation.findFirst({
    where: (table, { and, eq, gte }) =>
      and(
        eq(table.subscriptionId, subscription.id),
        eq(table.status, 'SUCCEEDED'),
        gte(table.donatedAt, failedAt),
      ),
    columns: { id: true },
  });
  await tx
    .update(DonationSubscription)
    .set({
      lastPaymentFailedAt:
        invoice.status === 'paid' || newerSuccessfulDonation ? null : failedAt,
      updatedAt: new Date(),
    })
    .where(eq(DonationSubscription.id, subscription.id));
}

async function applyChargeRefund(tx: TransactionClient, charge: Stripe.Charge) {
  const paymentIntentId = stripeId(charge.payment_intent);
  const [adjustment] = await tx
    .insert(DonationPaymentAdjustment)
    .values({
      stripeChargeId: charge.id,
      stripePaymentIntentId: paymentIntentId,
      chargeAmountCents: charge.amount,
      refundedAmountCents: charge.amount_refunded,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: DonationPaymentAdjustment.stripeChargeId,
      set: {
        stripePaymentIntentId: paymentIntentId,
        chargeAmountCents: charge.amount,
        refundedAmountCents: charge.amount_refunded,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (adjustment) {
    await applyAdjustmentToMatchingDonation(tx, adjustment);
  }
}

async function applyDispute(tx: TransactionClient, dispute: Stripe.Dispute) {
  const paymentIntentId = stripeId(dispute.payment_intent);
  const chargeId = stripeId(dispute.charge);
  if (!paymentIntentId && !chargeId) return;

  const existingAdjustment = paymentIntentId
    ? await tx.query.DonationPaymentAdjustment.findFirst({
        where: (table, { eq }) =>
          eq(table.stripePaymentIntentId, paymentIntentId),
      })
    : null;
  const [adjustment] = existingAdjustment
    ? await tx
        .update(DonationPaymentAdjustment)
        .set({
          disputeStatus: dispute.status,
          updatedAt: new Date(),
        })
        .where(
          eq(
            DonationPaymentAdjustment.stripeChargeId,
            existingAdjustment.stripeChargeId,
          ),
        )
        .returning()
    : await tx
        .insert(DonationPaymentAdjustment)
        .values({
          stripeChargeId: chargeId ?? `payment_intent:${paymentIntentId}`,
          stripePaymentIntentId: paymentIntentId,
          disputeStatus: dispute.status,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: DonationPaymentAdjustment.stripeChargeId,
          set: {
            stripePaymentIntentId: paymentIntentId,
            disputeStatus: dispute.status,
            updatedAt: new Date(),
          },
        })
        .returning();
  if (adjustment) {
    await applyAdjustmentToMatchingDonation(tx, adjustment);
  }
}

async function applyEvent(
  tx: TransactionClient,
  event: Stripe.Event,
  prepared: PreparedEvent,
) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      if (!prepared.session) throw new Error('Missing checkout session');
      await applyCheckoutSession(
        tx,
        event.type,
        prepared.session,
        prepared.subscription,
      );
      break;
    case 'invoice.paid':
      if (!prepared.invoice) throw new Error('Missing invoice');
      if (!prepared.subscription) break;
      await applyPaidInvoice(tx, prepared.invoice, prepared.subscription);
      break;
    case 'invoice.payment_failed':
      if (!prepared.invoice) throw new Error('Missing failed invoice');
      if (!prepared.subscription) break;
      await applyFailedInvoice(
        tx,
        prepared.invoice,
        prepared.subscription,
        new Date(event.created * 1000),
      );
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      if (!prepared.subscription) throw new Error('Missing subscription');
      await upsertSubscription(tx, prepared.subscription);
      break;
    case 'charge.refunded':
      if (!prepared.charge) throw new Error('Missing refunded charge');
      await applyChargeRefund(tx, prepared.charge);
      break;
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
      if (!prepared.dispute) throw new Error('Missing dispute');
      await applyDispute(tx, prepared.dispute);
      break;
    default:
      break;
  }
}

export async function processStripeEvent(event: Stripe.Event) {
  const exists = await db.query.DonationWebhookEvent.findFirst({
    where: (table, { eq }) => eq(table.id, event.id),
    columns: { id: true },
  });
  if (exists) return { duplicate: true };

  const prepared = await prepareEvent(event);
  let duplicate = false;

  await db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(DonationWebhookEvent)
      .values({
        id: event.id,
        type: event.type,
        stripeCreatedAt: new Date(event.created * 1000),
      })
      .onConflictDoNothing()
      .returning({ id: DonationWebhookEvent.id });

    if (!receipt) {
      duplicate = true;
      return;
    }

    await applyEvent(tx, event, prepared);
  });

  return { duplicate };
}
