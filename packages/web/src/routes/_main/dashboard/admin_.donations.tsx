import {
  IconDownload,
  IconExternalLink,
  IconRefresh,
  IconUpload,
} from '@tabler/icons-react';
import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@/components/ui';
import { formatDonationAmount } from '@/donations/amounts';
import { formatDonationDate } from '@/donations/dates';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/dashboard/admin_/donations')({
  component: AdminDonationsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) throw redirect({ to: '/auth/login' });

    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );
    if (currentUser.role !== 'ADMIN') throw redirect({ to: '/dashboard' });
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await Promise.all([
      queryClient.ensureQueryData(
        trpc.donations.getAdminOverview.queryOptions(),
      ),
      queryClient.ensureQueryData(
        trpc.donations.getAdminDonations.queryOptions({
          search: '',
          limit: 100,
        }),
      ),
      queryClient.ensureQueryData(
        trpc.donations.getAdminSubscriptions.queryOptions({
          search: '',
          activeOnly: false,
          limit: 200,
        }),
      ),
      queryClient.ensureQueryData(
        trpc.donations.getAdminImports.queryOptions(),
      ),
    ]);
    return {
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
});

function statusColor(status: string) {
  if (status === 'SUCCEEDED' || status === 'ACTIVE' || status === 'TRIALING') {
    return 'green';
  }
  if (
    status === 'PENDING' ||
    status === 'PAST_DUE' ||
    status === 'INCOMPLETE' ||
    status === 'RUNNING'
  ) {
    return 'yellow';
  }
  if (
    status === 'REFUNDED' ||
    status === 'PARTIALLY_REFUNDED' ||
    status === 'VALIDATED' ||
    status === 'COMPLETED'
  ) {
    return 'blue';
  }
  return 'red';
}

function frequencyLabel(frequency: string) {
  if (frequency === 'ONE_TIME') return 'One time';
  return frequency.charAt(0) + frequency.slice(1).toLowerCase();
}

function billingCadence(frequency: string) {
  if (frequency === 'QUARTERLY') return 'Every three months';
  if (frequency === 'YEARLY') return 'Yearly';
  return 'Monthly';
}

type ImportResult = {
  rowCount: number;
  readyCount: number;
  skippedCount: number;
  importedCount: number;
  duplicateCount: number;
  createdCount?: number;
  recoveredCount?: number;
  scheduledCents?: number;
  mode?: string;
};

async function postImport(payload: Record<string, unknown>) {
  const response = await fetch('/api/donations/imports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = (await response.json().catch(() => ({}))) as ImportResult & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(result.error ?? 'The import failed.');
  }
  return result;
}

function FilePicker({
  label,
  help,
  onChange,
}: {
  label: string;
  help?: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-primary block text-sm font-medium">{label}</span>
      {help ? (
        <span className="text-secondary mb-1 block text-xs">{help}</span>
      ) : null}
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className="text-primary file:bg-brand/10 file:text-brand mt-1 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:px-3 file:py-2 file:font-semibold"
      />
    </label>
  );
}

function ResultAlert({
  result,
  title,
}: {
  result: ImportResult;
  title: string;
}) {
  return (
    <Alert color="green" title={title} className="mt-4">
      {result.readyCount.toLocaleString()} records were ready and{' '}
      {result.skippedCount.toLocaleString()} were skipped.
      {result.importedCount > 0
        ? ` Imported ${result.importedCount.toLocaleString()}.`
        : ''}
      {result.duplicateCount > 0
        ? ` Found ${result.duplicateCount.toLocaleString()} already imported.`
        : ''}
      {result.scheduledCents != null
        ? ` Scheduled total: ${formatDonationAmount(result.scheduledCents)}.`
        : ''}
      {result.mode && result.mode !== 'not-checked'
        ? ` Stripe mode: ${result.mode}.`
        : ''}
    </Alert>
  );
}

function HistoryImport({ refresh }: { refresh: () => Promise<unknown> }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<'VALIDATE' | 'APPLY' | null>(null);

  const run = async (action: 'VALIDATE' | 'APPLY') => {
    if (!file) return;
    if (
      action === 'APPLY' &&
      !window.confirm(
        'Import this transaction history? Existing source references will be skipped.',
      )
    ) {
      return;
    }
    setRunning(action);
    setError(null);
    setResult(null);
    try {
      const next = await postImport({
        type: 'TRANSACTION_HISTORY',
        action,
        filename: file.name,
        csv: await file.text(),
      });
      setResult(next);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import failed.');
      await refresh();
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="border-fancy-pants rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
      <Title order={3} className="text-lg">
        Transaction history
      </Title>
      <Text size="sm" c="dimmed" className="mt-1 mb-4">
        Upload a transaction CSV with one payment per row. Validation does not
        write donation records. Imports are safe to retry.
      </Text>
      <Alert color="blue" className="mb-4">
        Required columns: Reference #, Status, Amount, Email, and Payment
        captured (UTC). Optional columns include names, fees, refunds, disputes,
        currency, and frequency.
      </Alert>
      <FilePicker label="Transaction CSV" onChange={setFile} />
      {error ? (
        <Alert color="red" title="Import failed" className="mt-4">
          {error}
        </Alert>
      ) : null}
      {result ? (
        <ResultAlert
          result={result}
          title={result.importedCount > 0 ? 'Import complete' : 'File is valid'}
        />
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="light"
          disabled={!file || running != null}
          loading={running === 'VALIDATE'}
          onClick={() => run('VALIDATE')}
        >
          Validate file
        </Button>
        <Button
          disabled={!file || running != null}
          loading={running === 'APPLY'}
          leftSection={<IconUpload size={16} />}
          onClick={() => run('APPLY')}
        >
          Import history
        </Button>
      </div>
    </div>
  );
}

function RecurringImport({ refresh }: { refresh: () => Promise<unknown> }) {
  const [plans, setPlans] = useState<File | null>(null);
  const [mapping, setMapping] = useState<File | null>(null);
  const [links, setLinks] = useState<File | null>(null);
  const [cutoverConfirmed, setCutoverConfirmed] = useState(false);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<'VALIDATE' | 'APPLY' | null>(null);
  const ready = Boolean(plans && mapping && links);

  const run = async (action: 'VALIDATE' | 'APPLY') => {
    if (!plans || !mapping || !links) return;
    if (
      action === 'APPLY' &&
      !window.confirm(
        'Create these recurring subscriptions in Stripe? This can schedule real future charges.',
      )
    ) {
      return;
    }
    setRunning(action);
    setError(null);
    setResult(null);
    try {
      const next = await postImport({
        type: 'RECURRING_PLANS',
        action,
        plansFilename: plans.name,
        plansCsv: await plans.text(),
        mappingFilename: mapping.name,
        mappingCsv: await mapping.text(),
        linksFilename: links.name,
        linksCsv: await links.text(),
        cutoverConfirmed,
        liveConfirmed,
      });
      setResult(next);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import failed.');
      await refresh();
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="border-fancy-pants rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
      <Title order={3} className="text-lg">
        Recurring plans
      </Title>
      <Text size="sm" c="dimmed" className="mt-1 mb-4">
        Validate the active-plan export, Stripe copy mapping, and
        plan-to-payment-source links together. Applying the import creates or
        recovers Stripe subscriptions without charging immediately.
      </Text>
      <Alert color="blue" className="mb-4">
        Plans use ID, Status, Frequency, Email, Amount, and Next_bill_date.
        Stripe mappings use customer_id_old, source_id_old, customer_id_new, and
        source_id_new. Plan links use Source Plan ID, Stripe Customer ID, and
        Stripe Source ID.
      </Alert>
      <div className="grid gap-4 md:grid-cols-3">
        <FilePicker
          label="Active plans CSV"
          help="One active or inactive plan per row"
          onChange={setPlans}
        />
        <FilePicker
          label="Stripe copy mapping CSV"
          help="Old and new customer/source IDs"
          onChange={setMapping}
        />
        <FilePicker
          label="Plan links CSV"
          help="Plan ID with original Stripe IDs"
          onChange={setLinks}
        />
      </div>
      {error ? (
        <Alert color="red" title="Migration failed" className="mt-4">
          {error}
        </Alert>
      ) : null}
      {result ? (
        <ResultAlert
          result={result}
          title={
            result.importedCount > 0 ? 'Migration complete' : 'Files are valid'
          }
        />
      ) : null}
      <div className="mt-4 flex flex-col gap-3">
        <Checkbox
          checked={cutoverConfirmed}
          onChange={setCutoverConfirmed}
          label="Source-platform cutover is complete"
          description="The old plans are stopped and can no longer charge donors."
        />
        <Checkbox
          checked={liveConfirmed}
          onChange={setLiveConfirmed}
          label="I reviewed the live Stripe migration"
          description="Required only when the copied customers are in live mode."
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="light"
            disabled={!ready || running != null}
            loading={running === 'VALIDATE'}
            onClick={() => run('VALIDATE')}
          >
            Validate files
          </Button>
          <Button
            color="red"
            disabled={!ready || !cutoverConfirmed || running != null}
            loading={running === 'APPLY'}
            leftSection={<IconUpload size={16} />}
            onClick={() => run('APPLY')}
          >
            Create Stripe subscriptions
          </Button>
        </div>
      </div>
    </div>
  );
}

function AdminDonationsPage() {
  const trpc = useTRPC();
  const [tab, setTab] = useState('recurring');
  const [donationSearch, setDonationSearch] = useState('');
  const [subscriptionSearch, setSubscriptionSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const { data: overview } = useSuspenseQuery(
    trpc.donations.getAdminOverview.queryOptions(),
  );
  const donationsQuery = useQuery(
    trpc.donations.getAdminDonations.queryOptions({
      search: donationSearch,
      limit: 100,
    }),
  );
  const subscriptionsQuery = useQuery(
    trpc.donations.getAdminSubscriptions.queryOptions({
      search: subscriptionSearch,
      activeOnly,
      limit: 200,
    }),
  );
  const importsQuery = useSuspenseQuery(
    trpc.donations.getAdminImports.queryOptions(),
  );

  const refundMutation = useMutation(
    trpc.donations.refundDonation.mutationOptions({
      onSuccess: () => donationsQuery.refetch(),
    }),
  );
  const manageMutation = useMutation(
    trpc.donations.manageAdminSubscription.mutationOptions({
      onSuccess: () => subscriptionsQuery.refetch(),
    }),
  );
  const portalMutation = useMutation(
    trpc.donations.createAdminPortalSession.mutationOptions({
      onSuccess: ({ url }) => window.location.assign(url),
    }),
  );
  const stripeError =
    refundMutation.isError || manageMutation.isError || portalMutation.isError;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Title order={1}>Donations</Title>
          <Text size="sm" c="dimmed">
            Review gifts, maintain recurring plans, and run migration imports.
          </Text>
        </div>
        <a
          href="/api/donations/admin-export"
          className="bg-brand inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <IconDownload size={16} />
          Export CSV
        </a>
      </div>

      {stripeError ? (
        <Alert
          color="red"
          title="Stripe action failed"
          withCloseButton
          onClose={() => {
            refundMutation.reset();
            manageMutation.reset();
            portalMutation.reset();
          }}
          className="mb-5"
        >
          Stripe did not complete the request. Check the Stripe dashboard before
          trying it again.
        </Alert>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="border-fancy-pants rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <Text size="sm" c="dimmed">
            Processed gifts
          </Text>
          <Text fw={500} className="mt-1 text-2xl">
            {overview.processedDonationCount.toLocaleString()}
          </Text>
        </div>
        <div className="border-fancy-pants rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <Text size="sm" c="dimmed">
            Gross received
          </Text>
          <Text fw={500} className="mt-1 text-2xl">
            {formatDonationAmount(overview.grossCents)}
          </Text>
        </div>
        <div className="border-fancy-pants rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <Text size="sm" c="dimmed">
            Active recurring gifts
          </Text>
          <Text fw={500} className="mt-1 text-2xl">
            {overview.activeRecurringCount.toLocaleString()}
          </Text>
        </div>
      </div>

      <Tabs value={tab} onChange={(next) => setTab(next ?? 'recurring')}>
        <Tabs.List className="mb-5 overflow-x-auto">
          <Tabs.Tab value="recurring">Recurring</Tabs.Tab>
          <Tabs.Tab value="transactions">Transactions</Tabs.Tab>
          <Tabs.Tab value="imports">Imports</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="recurring">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <Title order={2} className="text-lg">
              Recurring donations
            </Title>
            <div className="flex flex-wrap items-end gap-3">
              <Checkbox
                checked={activeOnly}
                onChange={setActiveOnly}
                label="Current only"
              />
              <TextInput
                label="Search"
                placeholder="Donor, email, or Stripe ID"
                value={subscriptionSearch}
                onChange={(event) => setSubscriptionSearch(event.target.value)}
              />
              <Button
                variant="light"
                aria-label="Refresh subscriptions"
                loading={subscriptionsQuery.isFetching}
                onClick={() => subscriptionsQuery.refetch()}
              >
                <IconRefresh size={16} />
              </Button>
            </div>
          </div>
          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Donor</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Billing</Table.Th>
                <Table.Th>References</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(subscriptionsQuery.data ?? []).map((subscription) => {
                const current = ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(
                  subscription.status,
                );
                return (
                  <Table.Tr key={subscription.id}>
                    <Table.Td>
                      <Text fw={500}>
                        {subscription.donorName || 'No name'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {subscription.donorEmail}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {formatDonationAmount(
                        subscription.amountCents,
                        subscription.currency,
                      )}
                      <Text size="xs" c="dimmed">
                        {billingCadence(subscription.frequency)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(subscription.status)}>
                        {subscription.status.replaceAll('_', ' ')}
                      </Badge>
                      {subscription.cancelAtPeriodEnd ? (
                        <Text size="xs" c="red" className="mt-1">
                          Stops at period end
                        </Text>
                      ) : null}
                      {subscription.lastPaymentFailedAt ? (
                        <Text size="xs" c="red" className="mt-1">
                          Latest payment failed
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      {subscription.currentPeriodEnd?.toLocaleDateString() ??
                        'Not set'}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" className="font-mono">
                        {subscription.stripeSubscriptionId}
                      </Text>
                      {subscription.legacyExternalId ? (
                        <Text size="xs" c="dimmed" className="font-mono">
                          {subscription.legacyExternalId}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <div className="flex min-w-44 flex-col gap-2">
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconExternalLink size={14} />}
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
                          Billing portal
                        </Button>
                        {current ? (
                          <Button
                            size="xs"
                            variant="light"
                            color={
                              subscription.cancelAtPeriodEnd ? 'green' : 'red'
                            }
                            loading={
                              manageMutation.isPending &&
                              manageMutation.variables?.subscriptionId ===
                                subscription.id
                            }
                            onClick={() =>
                              manageMutation.mutate({
                                subscriptionId: subscription.id,
                                action: subscription.cancelAtPeriodEnd
                                  ? 'RESUME'
                                  : 'CANCEL_AT_PERIOD_END',
                              })
                            }
                          >
                            {subscription.cancelAtPeriodEnd
                              ? 'Resume'
                              : 'Stop at period end'}
                          </Button>
                        ) : null}
                        {current ? (
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            onClick={() => {
                              if (
                                window.confirm(
                                  'Cancel this subscription immediately? This cannot be undone.',
                                )
                              ) {
                                manageMutation.mutate({
                                  subscriptionId: subscription.id,
                                  action: 'CANCEL_NOW',
                                });
                              }
                            }}
                          >
                            Cancel now
                          </Button>
                        ) : null}
                      </div>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="transactions">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <Title order={2} className="text-lg">
              Donation ledger
            </Title>
            <div className="flex items-end gap-2">
              <TextInput
                label="Search"
                placeholder="Name, email, or reference"
                value={donationSearch}
                onChange={(event) => setDonationSearch(event.target.value)}
              />
              <Button
                variant="light"
                aria-label="Refresh donations"
                loading={donationsQuery.isFetching}
                onClick={() => donationsQuery.refetch()}
              >
                <IconRefresh size={16} />
              </Button>
            </div>
          </div>
          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Donor</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(donationsQuery.data ?? []).map((donation) => (
                <Table.Tr key={donation.id}>
                  <Table.Td>{formatDonationDate(donation.donatedAt)}</Table.Td>
                  <Table.Td>
                    <Text fw={500}>{donation.donorName || 'No name'}</Text>
                    <Text size="sm" c="dimmed">
                      {donation.donorEmail || 'No email'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {formatDonationAmount(
                      donation.amountCents,
                      donation.currency,
                    )}
                  </Table.Td>
                  <Table.Td>{frequencyLabel(donation.frequency)}</Table.Td>
                  <Table.Td>
                    <Badge color={statusColor(donation.status)}>
                      {donation.status.replaceAll('_', ' ')}
                    </Badge>
                    {donation.disputeStatus ? (
                      <Text size="sm" c="red">
                        Dispute: {donation.disputeStatus}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>{donation.source}</Table.Td>
                  <Table.Td>
                    {donation.source === 'STRIPE' &&
                    ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(
                      donation.status,
                    ) ? (
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        loading={
                          refundMutation.isPending &&
                          refundMutation.variables?.donationId === donation.id
                        }
                        onClick={() => {
                          if (
                            window.confirm(
                              `Refund ${formatDonationAmount(
                                donation.amountCents -
                                  donation.refundedAmountCents,
                                donation.currency,
                              )} through Stripe?`,
                            )
                          ) {
                            refundMutation.mutate({
                              donationId: donation.id,
                            });
                          }
                        }}
                      >
                        Refund
                      </Button>
                    ) : donation.receiptUrl ? (
                      <a
                        href={donation.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand text-sm hover:underline"
                      >
                        Receipt
                      </a>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="imports">
          <Alert color="blue" title="Validate before applying" className="mb-5">
            Validation checks file structure and migration relationships without
            writing donations or creating Stripe subscriptions. Import files are
            processed in memory and are not stored.
          </Alert>
          <div className="grid gap-5">
            <HistoryImport refresh={() => importsQuery.refetch()} />
            <RecurringImport
              refresh={async () => {
                await Promise.all([
                  importsQuery.refetch(),
                  subscriptionsQuery.refetch(),
                ]);
              }}
            />
          </div>

          <Title order={2} className="mt-8 mb-3 text-lg">
            Recent import runs
          </Title>
          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Started</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>File</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Counts</Table.Th>
                <Table.Th>Result</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {importsQuery.data.map((batch) => (
                <Table.Tr key={batch.id}>
                  <Table.Td>{batch.createdAt.toLocaleString()}</Table.Td>
                  <Table.Td>
                    {batch.type === 'TRANSACTION_HISTORY'
                      ? 'History'
                      : 'Recurring'}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" className="max-w-64 truncate">
                      {batch.filename}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={statusColor(batch.status)}>
                      {batch.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">
                      {batch.readyCount} ready / {batch.skippedCount} skipped
                    </Text>
                    <Text size="xs" c="dimmed">
                      {batch.importedCount} imported / {batch.duplicateCount}{' '}
                      existing
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {batch.error ? (
                      <Text size="xs" c="red">
                        {batch.error}
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">
                        {batch.completedAt?.toLocaleString() ?? 'In progress'}
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
