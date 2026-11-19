import {
  AppUserEmail,
  DonationDonor,
  db,
  type TransactionClient,
} from '@letschurch/db';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { normalizeEmail } from '@/util/normalize-email';

export const normalizeDonationEmail = normalizeEmail;

/**
 * Called before a user stops holding `email`. Donor rows keyed by that email
 * are detached from it so a future holder of the address can't claim them.
 *
 * Unclaimed donor rows are adopted by the user only if they hold `email`
 * **verified** — the same rule as `claimDonorsForVerifiedUser`. Otherwise
 * anyone could type a guest donor's address into their profile, change it
 * again, and walk off with that donor's history and Stripe billing portal.
 * For an unverified address we only touch rows this user already owns.
 */
export async function releaseDonorEmailForUser(
  tx: TransactionClient,
  appUserId: string,
  email: string,
) {
  const normalized = normalizeDonationEmail(email);
  const verified = await tx.query.AppUserEmail.findFirst({
    where: (t, { and, eq, isNotNull }) =>
      and(
        eq(t.appUserId, appUserId),
        eq(t.email, normalized),
        isNotNull(t.verifiedAt),
      ),
    columns: { id: true },
  });

  if (verified) {
    await tx
      .update(DonationDonor)
      .set({
        appUserId: sql`coalesce(${DonationDonor.appUserId}, ${appUserId})`,
        email: null,
        updatedAt: new Date(),
      })
      .where(eq(DonationDonor.email, normalized));
    return;
  }

  await tx
    .update(DonationDonor)
    .set({ email: null, updatedAt: new Date() })
    .where(
      and(
        eq(DonationDonor.email, normalized),
        eq(DonationDonor.appUserId, appUserId),
      ),
    );
}

export async function claimDonorsForVerifiedUser(appUserId: string) {
  const rows = await db
    .select({ email: AppUserEmail.email })
    .from(AppUserEmail)
    .where(
      and(
        eq(AppUserEmail.appUserId, appUserId),
        isNotNull(AppUserEmail.verifiedAt),
      ),
    );

  const emails = [
    ...new Set(rows.map((row) => normalizeDonationEmail(row.email))),
  ];
  if (emails.length === 0) return;

  await db
    .update(DonationDonor)
    .set({ appUserId, updatedAt: new Date() })
    .where(
      and(
        inArray(DonationDonor.email, emails),
        isNull(DonationDonor.appUserId),
      ),
    );
}
