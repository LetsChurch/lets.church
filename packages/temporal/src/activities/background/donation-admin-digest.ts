import {
  db,
  Donation,
  DonationAdminDigest,
  DonationDonor,
} from '@letschurch/db';
import { encryptPayload } from '@letschurch/util/server/encrypted-payload';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { buildDonationAdminDigestEmail } from '../../util/donation-admin-digest';
import logger from '../../util/logger';
import sendEmail from './send-email';

const moduleLogger = logger.child({ module: 'donation-admin-digest' });

const FROM = 'hello@lets.church';
const DAY_MS = 24 * 60 * 60 * 1000;

// Statuses of a payment that went through, even if refunded or disputed since.
const PAID_STATUSES = [
  'SUCCEEDED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'DISPUTED',
] as const;

/**
 * Email ADMIN_EMAIL the gifts queued since the last digest. Returns the queued
 * donation ids it covered so the workflow can clear them; nothing is sent when
 * the queue is empty. Gifts are queued by the web app in the same transaction
 * that marks them succeeded.
 */
export async function sendDonationAdminDigest(): Promise<{
  donationIds: string[];
}> {
  const rows = await db
    .select({
      donationId: Donation.id,
      subscriptionId: Donation.subscriptionId,
      donatedAt: Donation.donatedAt,
      amountCents: Donation.amountCents,
      currency: Donation.currency,
      status: Donation.status,
      frequency: Donation.frequency,
      donorName: DonationDonor.name,
      donorEmail: DonationDonor.email,
    })
    .from(DonationAdminDigest)
    .innerJoin(Donation, eq(Donation.id, DonationAdminDigest.donationId))
    .innerJoin(DonationDonor, eq(DonationDonor.id, Donation.donorId));
  const donationIds = rows.map((row) => row.donationId);
  if (rows.length === 0) {
    moduleLogger.info('No gifts since the last digest');
    return { donationIds };
  }

  const { ADMIN_EMAIL, WEB_URL } = z
    .object({ ADMIN_EMAIL: z.email().optional(), WEB_URL: z.url() })
    .parse(process.env);
  if (!ADMIN_EMAIL) {
    // Clear the queue anyway so it can't grow without bound.
    moduleLogger.warn('ADMIN_EMAIL is not set, skipping donation digest');
    return { donationIds };
  }

  // A gift starts a plan when it is the plan's first payment that went through.
  const subscriptionIds = [
    ...new Set(rows.flatMap((row) => row.subscriptionId ?? [])),
  ];
  const firstPayments = new Map<string, { id: string; at: number }>();
  if (subscriptionIds.length > 0) {
    const payments = await db
      .select({
        id: Donation.id,
        subscriptionId: Donation.subscriptionId,
        donatedAt: Donation.donatedAt,
      })
      .from(Donation)
      .where(
        and(
          inArray(Donation.subscriptionId, subscriptionIds),
          inArray(Donation.status, [...PAID_STATUSES]),
        ),
      );
    for (const payment of payments) {
      if (!payment.subscriptionId) continue;
      const first = firstPayments.get(payment.subscriptionId);
      const at = payment.donatedAt.getTime();
      if (!first || at < first.at) {
        firstPayments.set(payment.subscriptionId, { id: payment.id, at });
      }
    }
  }

  const email = buildDonationAdminDigestEmail(
    {
      day: new Date(Date.now() - DAY_MS),
      gifts: rows.map((row) => ({
        ...row,
        newPlan:
          row.subscriptionId != null &&
          firstPayments.get(row.subscriptionId)?.id === row.donationId,
      })),
    },
    WEB_URL,
  );
  // Encrypted like the per-gift emails it replaces: donor names and addresses
  // stay out of logs and errors.
  await sendEmail({
    kind: 'encrypted',
    payload: encryptPayload(
      JSON.stringify({ from: FROM, to: ADMIN_EMAIL, ...email }),
    ),
  });
  moduleLogger.info(
    { context: { gifts: rows.length } },
    'Sent donation admin digest',
  );
  return { donationIds };
}

/**
 * Remove gifts from the digest queue once a digest covering them went out. A
 * separate activity so a database error here never resends the digest.
 */
export async function clearDonationAdminDigest({
  donationIds,
}: {
  donationIds: string[];
}) {
  if (donationIds.length === 0) return;
  await db
    .delete(DonationAdminDigest)
    .where(inArray(DonationAdminDigest.donationId, donationIds));
}
