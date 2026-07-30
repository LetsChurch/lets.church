import {
  AppUserEmail,
  DonationCheckout,
  DonationDonor,
  db,
} from '@letschurch/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { z } from 'zod';

import type { donationCheckoutSchema } from '@/schemas/donations';

import { donationAmounts } from './amounts';
import { donationCheckoutCustomerParams } from './checkout-customer';
import { normalizeDonationEmail } from './identity';
import { getStripe, getStripeConfig } from './stripe-client';

type CheckoutInput = z.infer<typeof donationCheckoutSchema>;

async function emailBelongsToVerifiedUser(
  appUserId: string | null,
  email: string,
) {
  if (!appUserId) return false;

  const rows = await db
    .select({ email: AppUserEmail.email })
    .from(AppUserEmail)
    .where(
      and(
        eq(AppUserEmail.appUserId, appUserId),
        isNotNull(AppUserEmail.verifiedAt),
      ),
    );

  return rows.some(
    (row) =>
      normalizeDonationEmail(row.email) === normalizeDonationEmail(email),
  );
}

async function getOrCreateDonor(
  email: string,
  name: string,
  appUserId: string | null,
) {
  const [donor] = await db
    .insert(DonationDonor)
    .values({
      email,
      name: name || null,
      appUserId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: DonationDonor.email,
      set: {
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!donor) throw new Error('Failed to create donor');

  const updates: Partial<typeof DonationDonor.$inferInsert> = {};
  // A guest can type any email address, so only a user who has proved control
  // of that address may update an existing donor's identity.
  if (
    !donor.name &&
    name &&
    appUserId &&
    (!donor.appUserId || donor.appUserId === appUserId)
  ) {
    updates.name = name;
  }
  if (!donor.appUserId && appUserId) updates.appUserId = appUserId;

  if (Object.keys(updates).length > 0) {
    const [updated] = await db
      .update(DonationDonor)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(DonationDonor.id, donor.id))
      .returning();
    return updated ?? donor;
  }

  return donor;
}

export async function createDonationCheckout(
  input: CheckoutInput,
  appUserId: string | null,
) {
  const email = normalizeDonationEmail(input.email);
  const linkedAppUserId = (await emailBelongsToVerifiedUser(appUserId, email))
    ? appUserId
    : null;
  const donor = await getOrCreateDonor(email, input.name, linkedAppUserId);
  const amounts = donationAmounts(input.amountCents, input.coverFees);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  const [checkout] = await db
    .insert(DonationCheckout)
    .values({
      donorId: donor.id,
      frequency: input.frequency,
      ...amounts,
      expiresAt,
      updatedAt: now,
    })
    .returning();

  if (!checkout) throw new Error('Failed to create donation checkout');

  const { WEB_URL } = getStripeConfig();
  const stripe = getStripe();
  const metadata = {
    donationCheckoutId: checkout.id,
    donationDonorId: donor.id,
  };
  const recurring = input.frequency === 'MONTHLY';
  const session = await stripe.checkout.sessions.create(
    {
      mode: recurring ? 'subscription' : 'payment',
      ...donationCheckoutCustomerParams(email),
      client_reference_id: checkout.id,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amounts.amountCents,
            product_data: {
              name: recurring
                ? "Monthly donation to Let's Church"
                : "Donation to Let's Church",
            },
            ...(recurring ? { recurring: { interval: 'month' as const } } : {}),
          },
        },
      ],
      metadata,
      payment_intent_data: recurring
        ? undefined
        : {
            description: "Donation to Let's Church Inc.",
            metadata,
          },
      subscription_data: recurring
        ? {
            description: "Monthly donation to Let's Church Inc.",
            metadata,
          }
        : undefined,
      submit_type: 'donate',
      success_url: `${WEB_URL}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${WEB_URL}/donate?canceled=true`,
    },
    {
      idempotencyKey: `donation-checkout-${checkout.id}`,
    },
  );

  if (!session.url) throw new Error('Stripe did not return a checkout URL');

  await db
    .update(DonationCheckout)
    .set({
      stripeCheckoutSessionId: session.id,
      expiresAt: new Date(session.expires_at * 1000),
      updatedAt: new Date(),
    })
    .where(eq(DonationCheckout.id, checkout.id));

  return {
    url: session.url,
    sessionId: session.id,
  };
}
