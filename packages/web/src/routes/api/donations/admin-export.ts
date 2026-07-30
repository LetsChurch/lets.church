import { Donation, DonationDonor, db } from '@letschurch/db';
import { createFileRoute } from '@tanstack/react-router';
import { desc, eq } from 'drizzle-orm';

import { donationCsvCell } from '@/donations/csv';

export const Route = createFileRoute('/api/donations/admin-export')({
  component: () => null,
  server: {
    handlers: {
      GET: async () => {
        const { getSession } = await import('@/util/auth');
        const session = await getSession();
        if (!session) return new Response('unauthorized', { status: 401 });
        if (session.appUser.role !== 'ADMIN') {
          return new Response('forbidden', { status: 403 });
        }

        const donations = await db
          .select({
            date: Donation.donatedAt,
            name: DonationDonor.name,
            email: DonationDonor.email,
            amountCents: Donation.amountCents,
            refundedAmountCents: Donation.refundedAmountCents,
            currency: Donation.currency,
            frequency: Donation.frequency,
            status: Donation.status,
            source: Donation.source,
            externalId: Donation.externalId,
            disputeStatus: Donation.disputeStatus,
          })
          .from(Donation)
          .innerJoin(DonationDonor, eq(DonationDonor.id, Donation.donorId))
          .orderBy(desc(Donation.donatedAt));

        const headings = [
          'Date UTC',
          'Name',
          'Email',
          'Amount',
          'Refunded',
          'Currency',
          'Frequency',
          'Status',
          'Source',
          'Reference',
          'Dispute Status',
        ];
        const rows = donations.map((donation) =>
          [
            donation.date.toISOString(),
            donation.name,
            donation.email,
            (donation.amountCents / 100).toFixed(2),
            (donation.refundedAmountCents / 100).toFixed(2),
            donation.currency.toUpperCase(),
            donation.frequency,
            donation.status,
            donation.source,
            donation.externalId,
            donation.disputeStatus,
          ]
            .map(donationCsvCell)
            .join(','),
        );
        const csv = [headings.map(donationCsvCell).join(','), ...rows].join(
          '\n',
        );

        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="letschurch-donations-${new Date()
              .toISOString()
              .slice(0, 10)}.csv"`,
            'Cache-Control': 'private, no-store',
          },
        });
      },
    },
  },
});
