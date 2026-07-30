import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { Button, Table, Text, Title } from '@/components/ui';
import { formatDonationAmount } from '@/donations/amounts';
import { donationStatementYear, formatDonationDate } from '@/donations/dates';
import { useTRPC } from '@/trpc/react';

const paramsSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200),
});

export const Route = createFileRoute(
  '/_main/dashboard/account_/donations_/$year',
)({
  component: DonationStatementPage,
  params: {
    parse: (params) => paramsSchema.parse(params),
    stringify: (params) => ({ year: String(params.year) }),
  },
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(trpc.donations.getMine.queryOptions());
    return {
      backNavigation: {
        label: 'Donations',
        to: '/dashboard/account/donations',
      },
      year: params.year,
    };
  },
});

function DonationStatementPage() {
  const { year } = Route.useParams();
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.donations.getMine.queryOptions());
  const donations = data.donations.filter(
    (donation) =>
      donationStatementYear(donation.donatedAt) === year &&
      ['SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(donation.status),
  );
  const totalCents = donations.reduce(
    (total, donation) =>
      total + donation.amountCents - donation.refundedAmountCents,
    0,
  );

  return (
    <article className="mx-auto max-w-3xl bg-white p-4 text-black sm:p-8 dark:bg-zinc-900 dark:text-white print:bg-white print:p-0 print:text-black">
      <div className="mb-6 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print or save as PDF</Button>
      </div>

      <header className="mb-8 border-b border-gray-300 pb-6">
        <Title order={1} className="mb-2 text-3xl print:text-black">
          {year} Donation Statement
        </Title>
        <Text fw={500} className="print:text-black">
          Let&apos;s Church Inc.
        </Text>
        <Text size="sm" className="print:text-black">
          2140 S Dupont Highway
          <br />
          Camden, DE 19934
          <br />
          EIN 92-3744006
        </Text>
      </header>

      <Text className="mb-6 leading-relaxed print:text-black">
        Let&apos;s Church Inc. received the donations listed below during {year}
        . We provided no goods or services in exchange for these gifts. Keep
        this statement with your tax records.
      </Text>

      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th>Reference</Table.Th>
            <Table.Th>Amount</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {donations.map((donation) => (
            <Table.Tr key={donation.id}>
              <Table.Td>{formatDonationDate(donation.donatedAt)}</Table.Td>
              <Table.Td>{donation.externalId}</Table.Td>
              <Table.Td>
                {formatDonationAmount(
                  donation.amountCents - donation.refundedAmountCents,
                  donation.currency,
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
        <Table.Tfoot>
          <Table.Tr>
            <Table.Th colSpan={2}>Total</Table.Th>
            <Table.Th>{formatDonationAmount(totalCents)}</Table.Th>
          </Table.Tr>
        </Table.Tfoot>
      </Table>

      <Text size="sm" className="mt-8 print:text-black">
        Questions: contact@lets.church
      </Text>
    </article>
  );
}
