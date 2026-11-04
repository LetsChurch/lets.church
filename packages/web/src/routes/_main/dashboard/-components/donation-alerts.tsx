import { IconAlertTriangle, IconArrowUpRight } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';

import { Badge, Button, Text, Title } from '@/components/ui';
import { modals } from '@/components/ui/confirm-modal';
import { formatDonationAmount } from '@/donations/amounts';
import { useTRPC } from '@/trpc/react';

// Pinned to UTC so the server render and the browser agree.
function formatAlertTime(date: Date) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

const kindLabels: Record<string, string> = {
  CHECKOUT_PAYMENT_FAILED: 'Card declined at checkout',
  RENEWAL_PAYMENT_FAILED: 'Recurring payment failed',
  WEBHOOK_FAILED: 'Stripe event failed to apply',
};

/**
 * Donation problems an admin should look at. Each resolves on its own when
 * the problem clears; dismissing hides it until the same object fails again.
 */
export function DonationAlerts() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, refetch } = useSuspenseQuery(
    trpc.donations.getAdminAlerts.queryOptions(),
  );
  const dismissMutation = useMutation(
    trpc.donations.dismissAdminAlerts.mutationOptions({
      onSuccess: () => {
        // The admin home page's badge counts the same alerts.
        void queryClient.invalidateQueries({
          queryKey: trpc.donations.getAdminAlertCount.queryKey(),
        });
        return refetch();
      },
    }),
  );

  if (data.total === 0) return null;

  return (
    <section
      aria-labelledby="donation-alerts-title"
      className="border-fancy-pants mb-8 rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconAlertTriangle size={20} className="text-red-600" />
          <Title order={2} id="donation-alerts-title" className="text-lg">
            Needs attention
          </Title>
          <Badge color="red">{data.total}</Badge>
        </div>
        <Button
          size="xs"
          variant="subtle"
          loading={dismissMutation.isPending}
          onClick={() =>
            modals.openConfirmModal({
              title: 'Dismiss all alerts',
              children: (
                <Text size="sm">
                  {data.total > data.alerts.length
                    ? `Dismiss the ${data.alerts.length} alerts shown here? The other ${data.total - data.alerts.length} will appear next.`
                    : 'Dismiss every alert shown here?'}{' '}
                  A new failure for the same payment or event brings it back.
                </Text>
              ),
              labels: { confirm: 'Dismiss all', cancel: 'Cancel' },
              onConfirm: () =>
                dismissMutation.mutate({
                  ids: data.alerts.map((alert) => alert.id),
                }),
            })
          }
        >
          Dismiss all
        </Button>
      </div>
      <ul className="divide-y divide-gray-200 dark:divide-zinc-800">
        {data.alerts.map((alert) => (
          <li
            key={alert.id}
            className="flex flex-wrap items-start justify-between gap-3 py-3"
          >
            <div className="min-w-0 flex-1">
              <Text fw={500}>
                {kindLabels[alert.kind] ?? alert.kind}
                {alert.amountCents != null
                  ? ` · ${formatDonationAmount(
                      alert.amountCents,
                      alert.currency ?? 'usd',
                    )}`
                  : null}
              </Text>
              {alert.donorName || alert.donorEmail ? (
                <Text size="sm">
                  {[alert.donorName, alert.donorEmail]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ) : null}
              {alert.message ? (
                <Text size="sm" c="dimmed" className="break-words">
                  {alert.message}
                </Text>
              ) : null}
              <Text size="xs" c="dimmed" className="mt-1">
                {alert.occurrences > 1
                  ? `${alert.occurrences} times, last `
                  : null}
                {formatAlertTime(alert.lastSeenAt)}
                {' · '}
                <span className="font-mono">{alert.stripeObjectId}</span>
              </Text>
            </div>
            <div className="flex items-center gap-2">
              {alert.stripeUrl ? (
                <a
                  href={alert.stripeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand inline-flex items-center gap-1 text-sm font-medium hover:underline"
                >
                  Stripe
                  <IconArrowUpRight size={14} />
                </a>
              ) : null}
              <Button
                size="xs"
                variant="light"
                loading={
                  dismissMutation.isPending &&
                  dismissMutation.variables?.ids.length === 1 &&
                  dismissMutation.variables.ids[0] === alert.id
                }
                onClick={() => dismissMutation.mutate({ ids: [alert.id] })}
              >
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {data.total > data.alerts.length ? (
        <Text size="sm" c="dimmed" className="mt-2">
          Showing the {data.alerts.length} most recent of {data.total}.
        </Text>
      ) : null}
    </section>
  );
}
