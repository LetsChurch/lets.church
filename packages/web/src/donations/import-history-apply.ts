import {
  Donation,
  DonationDonor,
  db,
  type TransactionClient,
} from '@letschurch/db';
import { sql } from 'drizzle-orm';

import type {
  PreparedImportedDonation,
  PreparedTransactionHistory,
} from './import-history';

async function importDonation(
  tx: TransactionClient,
  record: PreparedImportedDonation,
) {
  const externalId = `import:${record.reference}`;
  const existing = await tx.query.Donation.findFirst({
    where: (table, { eq }) => eq(table.externalId, externalId),
    columns: { id: true },
  });
  if (existing) return false;

  const donor = record.email
    ? await tx
        .insert(DonationDonor)
        .values({
          email: record.email,
          name: record.name,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: DonationDonor.email,
          set: {
            name: sql`coalesce(${DonationDonor.name}, excluded.name)`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: DonationDonor.id })
        .then((rows) => rows[0])
    : await tx
        .insert(DonationDonor)
        .values({
          name: record.name,
          updatedAt: new Date(),
        })
        .returning({ id: DonationDonor.id })
        .then((rows) => rows[0]);
  if (!donor) {
    throw new Error(`Failed to create donor for ${record.reference}.`);
  }

  const inserted = await tx
    .insert(Donation)
    .values({
      donorId: donor.id,
      source: 'IMPORT',
      externalId,
      frequency: record.frequency,
      status: record.status,
      baseAmountCents: record.baseAmountCents,
      feeCoverageCents: record.feeCoverageCents,
      amountCents: record.amountCents,
      processingFeeCents: record.processingFeeCents,
      netAmountCents: record.netAmountCents,
      refundedAmountCents: record.refundedAmountCents,
      currency: record.currency,
      disputeStatus: record.disputeStatus,
      donatedAt: record.donatedAt,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: Donation.externalId })
    .returning({ id: Donation.id });
  return inserted.length > 0;
}

export async function applyTransactionHistory(
  history: PreparedTransactionHistory,
  onProgress?: (progress: {
    importedCount: number;
    duplicateCount: number;
  }) => Promise<void>,
) {
  let importedCount = 0;
  let duplicateCount = 0;
  for (const donation of history.donations) {
    const imported = await db.transaction((tx) => importDonation(tx, donation));
    if (imported) importedCount += 1;
    else duplicateCount += 1;
    await onProgress?.({ importedCount, duplicateCount });
  }
  return { importedCount, duplicateCount };
}
