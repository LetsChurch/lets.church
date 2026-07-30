import {
  AppUserEmail,
  DonationDonor,
  db,
  type TransactionClient,
} from '@letschurch/db';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { normalizeEmail } from '@/util/normalize-email';

export const normalizeDonationEmail = normalizeEmail;

export async function releaseDonorEmailForUser(
  tx: TransactionClient,
  appUserId: string,
  email: string,
) {
  await tx
    .update(DonationDonor)
    .set({
      appUserId: sql`coalesce(${DonationDonor.appUserId}, ${appUserId})`,
      email: null,
      updatedAt: new Date(),
    })
    .where(eq(DonationDonor.email, normalizeDonationEmail(email)));
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
