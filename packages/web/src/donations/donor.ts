import {
  AppUserEmail,
  DonationDonor,
  type TransactionClient,
  type db,
} from '@letschurch/db';
import { and, eq, isNotNull } from 'drizzle-orm';

import { normalizeDonationEmail } from './identity';

export type DbClient = typeof db | TransactionClient;

export async function emailBelongsToVerifiedUser(
  client: DbClient,
  appUserId: string | null,
  email: string,
) {
  if (!appUserId) return false;

  const rows = await client
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

export async function getOrCreateDonor(
  client: DbClient,
  email: string,
  name: string,
  appUserId: string | null,
) {
  const [donor] = await client
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
    const [updated] = await client
      .update(DonationDonor)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(DonationDonor.id, donor.id))
      .returning();
    return updated ?? donor;
  }

  return donor;
}
