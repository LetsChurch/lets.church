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
  CheckoutNotLinkedError,
  raiseDonationAlert,
  resolveDonationAlerts,
  shouldAlertWebhookFailure,
} from './alerts';
import {
  isUuid,
  parseDonationCheckoutMetadata,
  parseMetadataCents,
} from './checkout-metadata';
import { emailBelongsToVerifiedUser, getOrCreateDonor } from './donor';
import {
  sendDonationNotifications,
  sendSubscriptionAdminNotice,
  sendWebhookFailureAdminNotice,
  type SubscriptionAdminNotice,
  type SubscriptionCancellation,
} from './notifications';
import {
  isNewlyScheduledCancellation,
  resolveCheckoutDonationStatus,
  resolveDonationAdjustmentStatus,
  resolveSubscriptionAmounts,
  stripeInvoiceExpand,
} from './reconciliation';
import { safeErrorMessage } from './safe-error-message';
import { getStripe } from './stripe-client';

const moduleLogger = logger.child({
  module: 'donations/webhooks',
});

// Donation ids that moved into SUCCEEDED while applying an event. Their
// notifications are sent only after the ledger transaction commits.
type SucceededDonations = string[];

/**
 * Upsert a donation ledger row and record whether this write is the one that
 * made it succeed, so a gift is acknowledged once even when Stripe sends
 * several events for it (e.g. completed, then async_payment_succeeded).
 */
async function upsertDonation(
  tx: TransactionClient,
  values: typeof Donation.$inferInsert,
  succeeded: SucceededDonations,
) {
  const previous = await tx.query.Donation.findFirst({
    where: (table, { eq }) => eq(table.externalId, values.externalId),
    columns: { status: true },
  });
  const [donation] = await tx
    .insert(Donation)
    .values(values)
    .onConflictDoUpdate({
      target: Donation.externalId,
      set: values,
    })
    .returning();
  if (!donation) return;
  await reconcileDonationAdjustment(tx, donation);
  if (donation.status === 'SUCCEEDED' && previous?.status !== 'SUCCEEDED') {
    succeeded.push(donation.id);
  }
}

type PreparedEvent = {
  session?: Stripe.Checkout.Session;
  invoice?: Stripe.Invoice;
  subscription?: Stripe.Subscription;
  // Metadata of the session that created `subscription`, when its checkout
  // isn't stored yet.
  checkoutMetadata?: Stripe.Metadata;
  charge?: Stripe.Charge;
  dispute?: Stripe.Dispute;
  paymentIntent?: Stripe.PaymentIntent;
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

// A subscription from a checkout whose first payment never succeeded: an
// abandoned gift, which is not stored.
function isUnpaidSubscription(subscription: Stripe.Subscription) {
  return (
    subscription.status === 'incomplete' ||
    subscription.status === 'incomplete_expired'
  );
}

// A value that isn't ours (e.g. edited in the Stripe dashboard) counts as no
// checkout.
function subscriptionCheckoutId(subscription: Stripe.Subscription | undefined) {
  const checkoutId = subscription?.metadata.donationCheckoutId;
  return isUuid(checkoutId) ? checkoutId : null;
}

/**
 * A subscription carries only its checkout id; the donor's details stay on the
 * Checkout Session that created it. A subscription event can arrive before that
 * session completes, so fetch them when the checkout isn't stored yet.
 */
async function pendingCheckoutMetadata(
  stripe: Stripe,
  subscription: Stripe.Subscription | undefined,
) {
  const checkoutId = subscriptionCheckoutId(subscription);
  if (!subscription || !checkoutId || isUnpaidSubscription(subscription)) {
    return undefined;
  }
  const stored = await db.query.DonationCheckout.findFirst({
    where: (table, { eq }) => eq(table.id, checkoutId),
    columns: { id: true },
  });
  if (stored) return undefined;
  const sessions = await stripe.checkout.sessions.list({
    subscription: subscription.id,
    limit: 1,
  });
  return sessions.data[0]?.metadata ?? undefined;
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
    const subscription =
      session.subscription && typeof session.subscription === 'object'
        ? session.subscription
        : undefined;
    return {
      session,
      subscription,
      invoice:
        subscription && event.type !== 'checkout.session.expired'
          ? await retrieveLatestInvoice(stripe, subscription)
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
    const subscription = subscriptionId
      ? await stripe.subscriptions.retrieve(subscriptionId)
      : undefined;
    return {
      invoice,
      subscription,
      checkoutMetadata: await pendingCheckoutMetadata(stripe, subscription),
    };
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const subscription = await stripe.subscriptions.retrieve(
      event.data.object.id,
    );
    return {
      subscription,
      checkoutMetadata: await pendingCheckoutMetadata(stripe, subscription),
    };
  }

  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = await stripe.paymentIntents.retrieve(
      event.data.object.id,
    );
    // A monthly gift's payment intent carries no metadata of its own; the
    // session it belongs to says whether it is a donation.
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntent.id,
      limit: 1,
    });
    return { paymentIntent, session: sessions.data[0] };
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

async function retrieveLatestInvoice(
  stripe: Stripe,
  subscription: Stripe.Subscription,
) {
  const invoiceId = stripeId(subscription.latest_invoice);
  return invoiceId
    ? stripe.invoices.retrieve(invoiceId, { expand: [...stripeInvoiceExpand] })
    : undefined;
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
  const invoice = subscription
    ? await retrieveLatestInvoice(stripe, subscription)
    : undefined;

  const succeeded: SucceededDonations = [];
  await db.transaction(async (tx) => {
    await applyCheckoutSession(
      tx,
      session.status === 'expired'
        ? 'checkout.session.expired'
        : 'checkout.session.completed',
      session,
      subscription,
      succeeded,
    );
    if (invoice?.status === 'paid' && subscription) {
      await applyPaidInvoice(tx, invoice, subscription, succeeded);
    }
  });

  for (const donationId of succeeded) {
    await sendDonationNotifications(donationId);
  }
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
  const result = parseMetadataCents(input);
  if (result == null) {
    throw new Error(
      `Invalid ${field} metadata on subscription ${subscriptionId}`,
    );
  }
  return result;
}

/**
 * Load a donation checkout, creating it (and its donor) from the Stripe
 * metadata on first sight. Checkouts are only stored once Stripe reports on
 * them, and a subscription event can arrive before the session completes, so
 * every event that carries the metadata may be the one that creates it.
 */
async function findOrCreateCheckout(
  tx: TransactionClient,
  checkoutId: string,
  metadata: Record<string, string> | null | undefined,
  expiresAt: Date | null,
) {
  const existing = await tx.query.DonationCheckout.findFirst({
    where: (table, { eq }) => eq(table.id, checkoutId),
  });
  if (existing) return existing;

  const pending = parseDonationCheckoutMetadata(metadata);
  if (!pending || pending.checkoutId !== checkoutId) return null;

  // The account link was checked when the checkout started, but the account
  // may since have been deleted or lost the address; check it again.
  const appUserId = (await emailBelongsToVerifiedUser(
    tx,
    pending.appUserId,
    pending.email,
  ))
    ? pending.appUserId
    : null;
  const donor = await getOrCreateDonor(
    tx,
    pending.email,
    pending.name,
    appUserId,
  );
  // A concurrent event for the same checkout may insert it first.
  const [inserted] = await tx
    .insert(DonationCheckout)
    .values({
      id: checkoutId,
      donorId: donor.id,
      frequency: pending.frequency,
      baseAmountCents: pending.baseAmountCents,
      feeCoverageCents: pending.feeCoverageCents,
      amountCents: pending.baseAmountCents + pending.feeCoverageCents,
      expiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  return (
    inserted ??
    (await tx.query.DonationCheckout.findFirst({
      where: (table, { eq }) => eq(table.id, checkoutId),
    })) ??
    null
  );
}

async function upsertSubscription(
  tx: TransactionClient,
  subscription: Stripe.Subscription,
  checkoutMetadata?: Stripe.Metadata,
) {
  const checkoutId = subscriptionCheckoutId(subscription);
  const checkout = checkoutId
    ? await findOrCreateCheckout(
        tx,
        checkoutId,
        // Subscriptions created before checkouts moved into session metadata
        // carry the full metadata themselves.
        checkoutMetadata ?? subscription.metadata,
        null,
      )
    : null;
  const existing = await tx.query.DonationSubscription.findFirst({
    where: (table, { eq }) => eq(table.stripeSubscriptionId, subscription.id),
  });
  // Our own checkout that can't be created yet (e.g. Stripe hasn't linked the
  // session to the subscription): fail so Stripe retries the event rather than
  // marking it processed and dropping the gift. Older subscriptions also carry
  // their donor id, which is enough on its own, and an unpaid one is skipped.
  if (
    checkoutId &&
    !checkout &&
    !existing &&
    !subscription.metadata.donationDonorId &&
    !isUnpaidSubscription(subscription)
  ) {
    throw new CheckoutNotLinkedError(
      `Donation checkout ${checkoutId} for subscription ${subscription.id} was not found`,
    );
  }
  const donorId =
    checkout?.donorId ??
    existing?.donorId ??
    subscription.metadata.donationDonorId;
  if (!donorId) {
    // An abandoned or declined monthly checkout leaves an unpaid subscription
    // that never had a donor; only a paid one is worth a warning.
    if (isUnpaidSubscription(subscription)) return null;
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
  // Metadata comes first: imports and donor amount changes write the current
  // split there, while the checkout row keeps the original gift's split.
  const { baseAmountCents, feeCoverageCents } = resolveSubscriptionAmounts(
    amountCents,
    [
      metadataBaseAmountCents == null || metadataFeeCoverageCents == null
        ? null
        : {
            baseAmountCents: metadataBaseAmountCents,
            feeCoverageCents: metadataFeeCoverageCents,
          },
      existing
        ? {
            baseAmountCents: existing.baseAmountCents,
            feeCoverageCents: existing.feeCoverageCents,
          }
        : null,
      checkout
        ? {
            baseAmountCents: checkout.baseAmountCents,
            feeCoverageCents: checkout.feeCoverageCents,
          }
        : null,
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
  subscription: Stripe.Subscription | undefined,
  succeeded: SucceededDonations,
) {
  const checkoutId =
    session.metadata?.donationCheckoutId ?? session.client_reference_id;
  // Our checkout ids are UUIDs; anything else is some other Checkout Session on
  // the account, and querying the uuid column with it would fail every retry.
  if (!isUuid(checkoutId)) return;

  // An abandoned checkout was never stored, and expiring must not create it,
  // so it gets no metadata to create from.
  const expired = eventType === 'checkout.session.expired';
  const checkout = await findOrCreateCheckout(
    tx,
    checkoutId,
    expired ? null : session.metadata,
    new Date(session.expires_at * 1000),
  );
  if (!checkout) {
    if (!expired && session.metadata?.donationCheckoutId) {
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

  if (expired) {
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
  // A card declined earlier in this checkout no longer needs attention.
  if (session.payment_status === 'paid') {
    await resolveDonationAlerts(tx, { stripeCheckoutSessionId: session.id });
  }

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

  await upsertDonation(tx, values, succeeded);
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
  succeeded: SucceededDonations,
  checkoutMetadata?: Stripe.Metadata,
) {
  const subscription = await upsertSubscription(
    tx,
    stripeSubscription,
    checkoutMetadata,
  );
  if (!subscription) return;
  await resolveDonationAlerts(tx, { stripeObjectId: invoice.id });
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

  await upsertDonation(tx, values, succeeded);

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
  checkoutMetadata?: Stripe.Metadata,
): Promise<SubscriptionAdminNotice | null> {
  const subscription = await upsertSubscription(
    tx,
    stripeSubscription,
    checkoutMetadata,
  );
  if (!subscription) return null;
  const newerSuccessfulDonation = await tx.query.Donation.findFirst({
    where: (table, { and, eq, gte }) =>
      and(
        eq(table.subscriptionId, subscription.id),
        eq(table.status, 'SUCCEEDED'),
        gte(table.donatedAt, failedAt),
      ),
    columns: { id: true },
  });
  const recovered =
    invoice.status === 'paid' || Boolean(newerSuccessfulDonation);
  await tx
    .update(DonationSubscription)
    .set({
      lastPaymentFailedAt: recovered ? null : failedAt,
      updatedAt: new Date(),
    })
    .where(eq(DonationSubscription.id, subscription.id));
  if (recovered) {
    await resolveDonationAlerts(tx, { stripeObjectId: invoice.id });
    return null;
  }
  const failureMessage = invoiceFailureMessage(invoice);
  await raiseDonationAlert(tx, {
    kind: 'RENEWAL_PAYMENT_FAILED',
    stripeObjectId: invoice.id,
    subscriptionId: subscription.id,
    amountCents: invoice.amount_due,
    currency: invoice.currency,
    message: failureMessage,
    livemode: invoice.livemode,
  });
  return {
    kind: 'PAYMENT_FAILED',
    subscriptionId: subscription.id,
    invoiceId: invoice.id,
    amountCents: invoice.amount_due,
    currency: invoice.currency,
    attemptCount: invoice.attempt_count,
    nextAttemptAt: invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000)
      : null,
    failureMessage: invoiceFailureMessage(invoice),
  };
}

function invoiceFailureMessage(invoice: Stripe.Invoice) {
  for (const invoicePayment of invoice.payments?.data ?? []) {
    const intent = invoicePayment.payment.payment_intent;
    if (typeof intent === 'object' && intent?.last_payment_error?.message) {
      return intent.last_payment_error.message;
    }
  }
  return null;
}

function subscriptionCancellation(
  subscription: Stripe.Subscription,
): SubscriptionCancellation {
  return {
    reason: subscription.cancellation_details?.reason ?? null,
    feedback: subscription.cancellation_details?.feedback ?? null,
    comment: subscription.cancellation_details?.comment ?? null,
  };
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

/**
 * A card declined on the Checkout page. The donor can try again there, so the
 * gift itself is not stored; the admin dashboard lists the decline until the
 * checkout is paid or an admin dismisses it.
 */
async function applyFailedCheckoutPayment(
  tx: TransactionClient,
  paymentIntent: Stripe.PaymentIntent,
  session: Stripe.Checkout.Session | undefined,
) {
  if (!session?.metadata?.donationCheckoutId) return;
  // The donor may already have paid with another card; a late decline event
  // must not reopen the alert that payment resolved.
  if (session.payment_status === 'paid') return;
  // A delayed method (e.g. a bank debit) that fails after the donor finished
  // checkout is a failed gift, recorded by `async_payment_failed`.
  if (session.status === 'complete') return;
  const error = paymentIntent.last_payment_error;
  const reason = error?.decline_code ?? error?.code;
  await raiseDonationAlert(tx, {
    kind: 'CHECKOUT_PAYMENT_FAILED',
    stripeObjectId: paymentIntent.id,
    stripeCheckoutSessionId: session.id,
    amountCents: paymentIntent.amount,
    currency: paymentIntent.currency,
    message: error?.message
      ? `${error.message}${reason ? ` (${reason})` : ''}`
      : (reason ?? null),
    livemode: paymentIntent.livemode,
  });
}

// Some failures clear on Stripe's next retry (a brief Stripe or network error),
// so the admin is emailed only once an event has kept failing.
const WEBHOOK_FAILURE_EMAIL_ATTEMPT = 3;

/**
 * Put an event that failed to apply on the admin dashboard, and email the
 * admin if it keeps failing. Stripe retries it; a later success resolves the
 * alert.
 */
async function recordWebhookFailure(event: Stripe.Event, error: unknown) {
  const message = `${event.type}: ${safeErrorMessage(error)}`;
  if (!shouldAlertWebhookFailure(error, event.created)) {
    moduleLogger.info(
      { targetId: event.id },
      'Stripe event arrived before its checkout was linked; awaiting retry',
    );
    return;
  }
  try {
    const occurrences = await raiseDonationAlert(db, {
      kind: 'WEBHOOK_FAILED',
      stripeObjectId: event.id,
      message,
      livemode: event.livemode,
    });
    if (occurrences === WEBHOOK_FAILURE_EMAIL_ATTEMPT) {
      await sendWebhookFailureAdminNotice({
        eventId: event.id,
        eventType: event.type,
        message,
      });
    }
  } catch (alertError) {
    moduleLogger.error(
      {
        err: new Error(safeErrorMessage(alertError)),
        targetId: event.id,
      },
      'Failed to record Stripe webhook failure',
    );
  }
}

async function applyEvent(
  tx: TransactionClient,
  event: Stripe.Event,
  prepared: PreparedEvent,
  succeeded: SucceededDonations,
  notices: SubscriptionAdminNotice[],
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
        succeeded,
      );
      // The first invoice's own event may have been applied before Stripe
      // marked the subscription paid, which records no gift, so record it here.
      if (prepared.invoice?.status === 'paid' && prepared.subscription) {
        await applyPaidInvoice(
          tx,
          prepared.invoice,
          prepared.subscription,
          succeeded,
        );
      }
      break;
    case 'invoice.paid':
      if (!prepared.invoice) throw new Error('Missing invoice');
      if (!prepared.subscription) break;
      await applyPaidInvoice(
        tx,
        prepared.invoice,
        prepared.subscription,
        succeeded,
        prepared.checkoutMetadata,
      );
      break;
    case 'invoice.payment_failed': {
      if (!prepared.invoice) throw new Error('Missing failed invoice');
      if (!prepared.subscription) break;
      const notice = await applyFailedInvoice(
        tx,
        prepared.invoice,
        prepared.subscription,
        new Date(event.created * 1000),
        prepared.checkoutMetadata,
      );
      if (notice) notices.push(notice);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const stripeSubscription = prepared.subscription;
      if (!stripeSubscription) throw new Error('Missing subscription');
      const subscription = await upsertSubscription(
        tx,
        stripeSubscription,
        prepared.checkoutMetadata,
      );
      if (!subscription) break;
      // A checkout that was never paid expires as incomplete_expired; that is
      // an abandoned gift, not a canceled plan.
      if (
        event.type === 'customer.subscription.deleted' &&
        stripeSubscription.status !== 'incomplete_expired'
      ) {
        notices.push({
          kind: 'ENDED',
          subscriptionId: subscription.id,
          endedAt: subscription.endedAt,
          cancellation: subscriptionCancellation(stripeSubscription),
        });
      }
      if (
        event.type === 'customer.subscription.updated' &&
        isNewlyScheduledCancellation(
          event.data.previous_attributes,
          stripeSubscription,
        )
      ) {
        notices.push({
          kind: 'CANCELLATION_SCHEDULED',
          subscriptionId: subscription.id,
          eventId: event.id,
          cancelAt: stripeSubscription.cancel_at
            ? new Date(stripeSubscription.cancel_at * 1000)
            : subscription.currentPeriodEnd,
          cancellation: subscriptionCancellation(stripeSubscription),
        });
      }
      break;
    }
    case 'payment_intent.payment_failed':
      if (!prepared.paymentIntent) throw new Error('Missing payment intent');
      await applyFailedCheckoutPayment(
        tx,
        prepared.paymentIntent,
        prepared.session,
      );
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
  if (exists) {
    // A concurrent delivery may have failed after another one applied it.
    await resolveDonationAlerts(db, { stripeObjectId: event.id });
    return { duplicate: true };
  }

  let duplicate = false;
  const succeeded: SucceededDonations = [];
  const notices: SubscriptionAdminNotice[] = [];

  try {
    const prepared = await prepareEvent(event);
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

      await applyEvent(tx, event, prepared, succeeded, notices);
      // A retry that applies clears the alert from its earlier failure.
      await resolveDonationAlerts(tx, { stripeObjectId: event.id });
    });
  } catch (error) {
    await recordWebhookFailure(event, error);
    throw error;
  }

  for (const donationId of succeeded) {
    await sendDonationNotifications(donationId);
  }
  for (const notice of notices) {
    await sendSubscriptionAdminNotice(notice);
  }

  return { duplicate };
}
