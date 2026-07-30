import {
  Donation,
  DonationDonor,
  DonationImportBatch,
  DonationSubscription,
  db,
} from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, ilike, inArray, lt, or, sum } from 'drizzle-orm';
import type Stripe from 'stripe';
import { z } from 'zod';

import { donationStatementYear } from '@/donations/dates';
import { claimDonorsForVerifiedUser } from '@/donations/identity';
import { getStripe, getStripeConfig } from '@/donations/stripe-client';

import { authProcedure, publicProcedure } from '../trpc';

const adminProcedure = authProcedure.use(async ({ ctx, next }) => {
  if (ctx.session.appUser.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

async function syncSubscriptionControlState(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  await db
    .update(DonationSubscription)
    .set({
      status:
        subscription.status.toUpperCase() as typeof DonationSubscription.$inferInsert.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: item?.current_period_end
        ? new Date(item.current_period_end * 1000)
        : null,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
      endedAt: subscription.ended_at
        ? new Date(subscription.ended_at * 1000)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(DonationSubscription.stripeSubscriptionId, subscription.id));
}

export const donationProcedures = {
  getCheckoutDefaults: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.session) return null;

    const [user, email] = await Promise.all([
      db.query.AppUser.findFirst({
        where: (table, { eq }) => eq(table.id, ctx.session!.appUserId),
        columns: { fullName: true },
      }),
      db.query.AppUserEmail.findFirst({
        where: (table, { and, eq, isNotNull }) =>
          and(
            eq(table.appUserId, ctx.session!.appUserId),
            isNotNull(table.verifiedAt),
          ),
        columns: { email: true },
        orderBy: (table, { desc }) => desc(table.verifiedAt),
      }),
    ]);

    return email
      ? {
          email: email.email,
          name: user?.fullName ?? '',
        }
      : null;
  }),

  getMine: authProcedure.query(async ({ ctx }) => {
    await claimDonorsForVerifiedUser(ctx.session.appUserId);

    const donors = await db.query.DonationDonor.findMany({
      where: (table, { eq }) => eq(table.appUserId, ctx.session.appUserId),
      columns: { id: true },
      with: {
        donations: {
          orderBy: (table, { desc }) => desc(table.donatedAt),
        },
        subscriptions: {
          orderBy: (table, { desc }) => desc(table.createdAt),
        },
      },
    });

    const donations = donors
      .flatMap((donor) => donor.donations)
      .sort((a, b) => b.donatedAt.getTime() - a.donatedAt.getTime());
    const subscriptions = donors
      .flatMap((donor) => donor.subscriptions)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      donations,
      subscriptions,
      statementYears: [
        ...new Set(
          donations.map((donation) =>
            donationStatementYear(donation.donatedAt),
          ),
        ),
      ].sort((a, b) => b - a),
    };
  }),

  createPortalSession: authProcedure
    .input(z.object({ subscriptionId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await claimDonorsForVerifiedUser(ctx.session.appUserId);
      const subscription = await db
        .select({
          stripeCustomerId: DonationSubscription.stripeCustomerId,
        })
        .from(DonationSubscription)
        .innerJoin(
          DonationDonor,
          eq(DonationDonor.id, DonationSubscription.donorId),
        )
        .where(
          and(
            eq(DonationSubscription.id, input.subscriptionId),
            eq(DonationDonor.appUserId, ctx.session.appUserId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!subscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Recurring donation not found',
        });
      }

      const portal = await getStripe().billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: `${getStripeConfig().WEB_URL}/dashboard/account/donations`,
      });
      return { url: portal.url };
    }),

  setMySubscriptionCancellation: authProcedure
    .input(
      z.object({
        subscriptionId: z.uuid(),
        cancelAtPeriodEnd: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await claimDonorsForVerifiedUser(ctx.session.appUserId);
      const subscription = await db
        .select({
          stripeSubscriptionId: DonationSubscription.stripeSubscriptionId,
          status: DonationSubscription.status,
        })
        .from(DonationSubscription)
        .innerJoin(
          DonationDonor,
          eq(DonationDonor.id, DonationSubscription.donorId),
        )
        .where(
          and(
            eq(DonationSubscription.id, input.subscriptionId),
            eq(DonationDonor.appUserId, ctx.session.appUserId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null);
      if (!subscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Recurring donation not found',
        });
      }
      if (!['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(subscription.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This recurring donation can no longer be changed',
        });
      }

      const updated = await getStripe().subscriptions.update(
        subscription.stripeSubscriptionId,
        { cancel_at_period_end: input.cancelAtPeriodEnd },
      );
      await syncSubscriptionControlState(updated);
      return {
        success: true,
        cancelAtPeriodEnd: updated.cancel_at_period_end,
      };
    }),

  getAdminOverview: adminProcedure.query(async () => {
    const [donationStats, subscriptionStats] = await Promise.all([
      db
        .select({
          count: count(),
          grossCents: sum(Donation.amountCents),
        })
        .from(Donation)
        .where(
          inArray(Donation.status, [
            'SUCCEEDED',
            'PARTIALLY_REFUNDED',
            'REFUNDED',
          ]),
        )
        .then((rows) => rows[0]),
      db
        .select({ count: count() })
        .from(DonationSubscription)
        .where(inArray(DonationSubscription.status, ['ACTIVE', 'TRIALING']))
        .then((rows) => rows[0]),
    ]);

    return {
      processedDonationCount: donationStats?.count ?? 0,
      grossCents: Number(donationStats?.grossCents ?? 0),
      activeRecurringCount: subscriptionStats?.count ?? 0,
    };
  }),

  getAdminImports: adminProcedure.query(async () => {
    const staleBefore = new Date(Date.now() - 30 * 60_000);
    await db
      .update(DonationImportBatch)
      .set({
        status: 'FAILED',
        error:
          'The import stopped before it completed. Review the saved counts, then retry the source files.',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(DonationImportBatch.status, 'RUNNING'),
          lt(DonationImportBatch.updatedAt, staleBefore),
        ),
      );

    return db
      .select({
        id: DonationImportBatch.id,
        type: DonationImportBatch.type,
        status: DonationImportBatch.status,
        filename: DonationImportBatch.filename,
        rowCount: DonationImportBatch.rowCount,
        readyCount: DonationImportBatch.readyCount,
        skippedCount: DonationImportBatch.skippedCount,
        importedCount: DonationImportBatch.importedCount,
        duplicateCount: DonationImportBatch.duplicateCount,
        error: DonationImportBatch.error,
        summary: DonationImportBatch.summary,
        createdAt: DonationImportBatch.createdAt,
        completedAt: DonationImportBatch.completedAt,
      })
      .from(DonationImportBatch)
      .orderBy(desc(DonationImportBatch.createdAt))
      .limit(50);
  }),

  getAdminDonations: adminProcedure
    .input(
      z.object({
        search: z.string().trim().max(200).default(''),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ input }) => {
      const search = input.search ? `%${input.search}%` : null;
      return db
        .select({
          id: Donation.id,
          donorName: DonationDonor.name,
          donorEmail: DonationDonor.email,
          source: Donation.source,
          externalId: Donation.externalId,
          frequency: Donation.frequency,
          status: Donation.status,
          amountCents: Donation.amountCents,
          refundedAmountCents: Donation.refundedAmountCents,
          currency: Donation.currency,
          receiptUrl: Donation.receiptUrl,
          disputeStatus: Donation.disputeStatus,
          donatedAt: Donation.donatedAt,
        })
        .from(Donation)
        .innerJoin(DonationDonor, eq(DonationDonor.id, Donation.donorId))
        .where(
          search
            ? or(
                ilike(DonationDonor.email, search),
                ilike(DonationDonor.name, search),
                ilike(Donation.externalId, search),
              )
            : undefined,
        )
        .orderBy(desc(Donation.donatedAt))
        .limit(input.limit);
    }),

  getAdminSubscriptions: adminProcedure
    .input(
      z.object({
        search: z.string().trim().max(200).default(''),
        activeOnly: z.boolean().default(false),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    )
    .query(async ({ input }) => {
      const search = input.search ? `%${input.search}%` : null;
      const filters = [
        search
          ? or(
              ilike(DonationDonor.email, search),
              ilike(DonationDonor.name, search),
              ilike(DonationSubscription.stripeSubscriptionId, search),
              ilike(DonationSubscription.legacyExternalId, search),
            )
          : undefined,
        input.activeOnly
          ? inArray(DonationSubscription.status, [
              'ACTIVE',
              'PAST_DUE',
              'INCOMPLETE',
              'TRIALING',
            ])
          : undefined,
      ].filter((filter) => filter !== undefined);

      return db
        .select({
          id: DonationSubscription.id,
          donorName: DonationDonor.name,
          donorEmail: DonationDonor.email,
          stripeSubscriptionId: DonationSubscription.stripeSubscriptionId,
          legacyExternalId: DonationSubscription.legacyExternalId,
          status: DonationSubscription.status,
          frequency: DonationSubscription.frequency,
          amountCents: DonationSubscription.amountCents,
          currency: DonationSubscription.currency,
          currentPeriodEnd: DonationSubscription.currentPeriodEnd,
          cancelAtPeriodEnd: DonationSubscription.cancelAtPeriodEnd,
          canceledAt: DonationSubscription.canceledAt,
          endedAt: DonationSubscription.endedAt,
          lastPaymentFailedAt: DonationSubscription.lastPaymentFailedAt,
          createdAt: DonationSubscription.createdAt,
        })
        .from(DonationSubscription)
        .innerJoin(
          DonationDonor,
          eq(DonationDonor.id, DonationSubscription.donorId),
        )
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(DonationSubscription.createdAt))
        .limit(input.limit);
    }),

  refundDonation: adminProcedure
    .input(z.object({ donationId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const donation = await db.query.Donation.findFirst({
        where: (table, { eq }) => eq(table.id, input.donationId),
      });
      if (!donation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Donation not found',
        });
      }
      if (
        donation.source !== 'STRIPE' ||
        !donation.stripePaymentIntentId ||
        !['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(donation.status)
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This donation cannot be refunded through Stripe',
        });
      }

      await getStripe().refunds.create(
        {
          payment_intent: donation.stripePaymentIntentId,
          reason: 'requested_by_customer',
          metadata: {
            donationId: donation.id,
            refundedByAppUserId: ctx.session.appUserId,
          },
        },
        {
          idempotencyKey: `donation-full-refund-${donation.id}`,
        },
      );

      return { success: true };
    }),

  manageAdminSubscription: adminProcedure
    .input(
      z.object({
        subscriptionId: z.uuid(),
        action: z.enum(['CANCEL_AT_PERIOD_END', 'RESUME', 'CANCEL_NOW']),
      }),
    )
    .mutation(async ({ input }) => {
      const subscription = await db.query.DonationSubscription.findFirst({
        where: (table, { eq }) => eq(table.id, input.subscriptionId),
      });
      if (!subscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Recurring donation not found',
        });
      }

      const updated =
        input.action === 'CANCEL_NOW'
          ? await getStripe().subscriptions.cancel(
              subscription.stripeSubscriptionId,
            )
          : await getStripe().subscriptions.update(
              subscription.stripeSubscriptionId,
              {
                cancel_at_period_end: input.action === 'CANCEL_AT_PERIOD_END',
              },
            );
      await syncSubscriptionControlState(updated);
      return { success: true, status: updated.status };
    }),

  createAdminPortalSession: adminProcedure
    .input(z.object({ subscriptionId: z.uuid() }))
    .mutation(async ({ input }) => {
      const subscription = await db.query.DonationSubscription.findFirst({
        where: (table, { eq }) => eq(table.id, input.subscriptionId),
        columns: { stripeCustomerId: true },
      });
      if (!subscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Recurring donation not found',
        });
      }
      const portal = await getStripe().billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: `${getStripeConfig().WEB_URL}/dashboard/admin/donations`,
      });
      return { url: portal.url };
    }),
};
