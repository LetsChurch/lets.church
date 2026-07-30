import {
  IconCalendarCancel,
  IconExternalLink,
  IconFileText,
  IconRefresh,
} from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import { Alert, Badge, Button, Table, Text, Title } from '@/components/ui';
import { formatDonationAmount } from '@/donations/amounts';
import { formatDonationDate } from '@/donations/dates';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/dashboard/account_/donations')({
  component: DonationsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(trpc.donations.getMine.queryOptions());
    return {
      backNavigation: {
        label: 'Account',
        to: '/dashboard/account',
      },
    };
  },
});

function donationStatusColor(status: string) {
  if (status === 'SUCCEEDED') return 'green';
  if (status === 'PENDING') return 'yellow';
  if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') return 'blue';
  return 'red';
}

function subscriptionStatusColor(status: string) {
  if (status === 'ACTIVE' || status === 'TRIALING') return 'green';
  if (status === 'PAST_DUE' || status === 'INCOMPLETE') return 'yellow';
  return 'gray';
}

function frequencyLabel(frequency: string) {
  if (frequency === 'ONE_TIME') return 'One time';
  return frequency.charAt(0) + frequency.slice(1).toLowerCase();
}

function billingCadence(frequency: string) {
  if (frequency === 'QUARTERLY') return 'every three months';
  if (frequency === 'YEARLY') return 'each year';
  return 'each month';
}

function DonationsPage() {
  const trpc = useTRPC();
  const { data, refetch } = useSuspenseQuery(
    trpc.donations.getMine.queryOptions(),
  );
  const portalMutation = useMutation(
    trpc.donations.createPortalSession.mutationOptions({
      onSuccess: ({ url }) => window.location.assign(url),
    }),
  );
  const cancellationMutation = useMutation(
    trpc.donations.setMySubscriptionCancellation.mutationOptions({
      onSuccess: () => refetch(),
    }),
  );
  const currentSubscriptions = data.subscriptions.filter((subscription) =>
    ['ACTIVE', 'TRIALING', 'PAST_DUE', 'INCOMPLETE'].includes(
      subscription.status,
    ),
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Title order={1}>Donations</Title>
        <Button component={Link} to="/donate">
          Make a donation
        </Button>
      </div>

      {portalMutation.isError || cancellationMutation.isError ? (
        <Alert
          color="red"
          title="We could not update this donation"
          withCloseButton
          onClose={() => {
            portalMutation.reset();
            cancellationMutation.reset();
          }}
          className="mb-5"
        >
          Stripe did not complete the request. Try again or contact
          contact@lets.church before making another change.
        </Alert>
      ) : null}

      {currentSubscriptions.length > 0 ? (
        <section className="mb-8">
          <Title order={2} className="mb-3 text-lg">
            Recurring donations
          </Title>
          <div className="grid gap-4 md:grid-cols-2">
            {currentSubscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className="border-fancy-pants rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <Text fw={500} className="text-lg">
                      {formatDonationAmount(
                        subscription.amountCents,
                        subscription.currency,
                      )}{' '}
                      {billingCadence(subscription.frequency)}
                    </Text>
                    {subscription.currentPeriodEnd ? (
                      <Text size="sm" c="dimmed">
                        {subscription.cancelAtPeriodEnd
                          ? 'Active through: '
                          : 'Next billing date: '}
                        {subscription.currentPeriodEnd.toLocaleDateString()}
                      </Text>
                    ) : null}
                  </div>
                  <Badge color={subscriptionStatusColor(subscription.status)}>
                    {subscription.status.replaceAll('_', ' ')}
                  </Badge>
                </div>
                {subscription.lastPaymentFailedAt ? (
                  <Text size="sm" c="red" className="mb-3">
                    Stripe could not collect the latest payment. Update your
                    payment method to keep this donation active.
                  </Text>
                ) : null}
                {subscription.cancelAtPeriodEnd ? (
                  <Alert color="blue" className="mb-3">
                    No more payments are scheduled. You can keep this recurring
                    donation active until the date above.
                  </Alert>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="light"
                    size="sm"
                    leftSection={<IconExternalLink size={16} />}
                    loading={
                      portalMutation.isPending &&
                      portalMutation.variables?.subscriptionId ===
                        subscription.id
                    }
                    onClick={() =>
                      portalMutation.mutate({
                        subscriptionId: subscription.id,
                      })
                    }
                  >
                    Payment method &amp; billing
                  </Button>
                  <Button
                    variant="light"
                    color={subscription.cancelAtPeriodEnd ? 'green' : 'red'}
                    size="sm"
                    leftSection={
                      subscription.cancelAtPeriodEnd ? (
                        <IconRefresh size={16} />
                      ) : (
                        <IconCalendarCancel size={16} />
                      )
                    }
                    loading={
                      cancellationMutation.isPending &&
                      cancellationMutation.variables?.subscriptionId ===
                        subscription.id
                    }
                    onClick={() => {
                      if (
                        !subscription.cancelAtPeriodEnd &&
                        !window.confirm(
                          'Stop future payments after the current billing period?',
                        )
                      ) {
                        return;
                      }
                      cancellationMutation.mutate({
                        subscriptionId: subscription.id,
                        cancelAtPeriodEnd: !subscription.cancelAtPeriodEnd,
                      });
                    }}
                  >
                    {subscription.cancelAtPeriodEnd
                      ? 'Keep donation active'
                      : 'Stop future payments'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Title order={2} className="text-lg">
            Donation history
          </Title>
          {data.statementYears.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.statementYears.map((year) => (
                <Button
                  key={year}
                  component={Link}
                  to="/dashboard/account/donations/$year"
                  params={{ year: String(year) }}
                  variant="light"
                  size="xs"
                  leftSection={<IconFileText size={14} />}
                >
                  {year} statement
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        {data.donations.length === 0 ? (
          <div className="border-fancy-pants rounded-lg bg-white p-8 text-center shadow-sm dark:bg-zinc-900">
            <Text fw={500} className="mb-2">
              No donations appear on this account.
            </Text>
            <Text size="sm" c="dimmed">
              We add guest donations after you verify the email used at
              checkout.
            </Text>
          </div>
        ) : (
          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Receipt</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.donations.map((donation) => (
                <Table.Tr key={donation.id}>
                  <Table.Td>{formatDonationDate(donation.donatedAt)}</Table.Td>
                  <Table.Td>
                    {formatDonationAmount(
                      donation.amountCents,
                      donation.currency,
                    )}
                  </Table.Td>
                  <Table.Td>{frequencyLabel(donation.frequency)}</Table.Td>
                  <Table.Td>
                    <Badge color={donationStatusColor(donation.status)}>
                      {donation.status.replaceAll('_', ' ')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {donation.receiptUrl ? (
                      <a
                        href={donation.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline"
                      >
                        View
                      </a>
                    ) : donation.source === 'IMPORT' ? (
                      <Text size="sm" c="dimmed">
                        Imported
                      </Text>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </section>

      <Text size="sm" c="dimmed">
        Contact{' '}
        <a
          className="text-brand hover:underline"
          href="mailto:contact@lets.church"
        >
          contact@lets.church
        </a>{' '}
        with questions about a receipt or refund.
      </Text>
    </>
  );
}
