import { IconRefresh } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import {
  ActionIcon,
  Badge,
  Button,
  Table,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="text-primary rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-zinc-800">
      {children}
    </code>
  );
}

export const Route = createFileRoute(
  '/_main/dashboard/admin_/failed-summaries',
)({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }

    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );

    if (currentUser.role !== 'ADMIN') {
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.admin.getFailedSummaries.queryOptions({
        limit: 50,
        offset: 0,
      }),
    );
    return {
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
});

function RouteComponent() {
  const trpc = useTRPC();
  const navigate = useNavigate();

  const { data, refetch } = useSuspenseQuery({
    ...trpc.dashboard.admin.getFailedSummaries.queryOptions({
      limit: 50,
      offset: 0,
    }),
    refetchInterval: 10000,
  });

  const regenerateMutation = useMutation(
    trpc.dashboard.admin.regenerateUploadSummary.mutationOptions({
      onSuccess: async () => {
        showSuccess({
          message: 'Summary regeneration started',
        });
        await refetch();
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to start summary regeneration',
        });
      },
    }),
  );

  const retryAllMutation = useMutation(
    trpc.dashboard.admin.retryAllFailedSummaries.mutationOptions({
      onSuccess: async ({ retriedCount, skippedCount, failedCount }) => {
        const message = `Summary retries: ${retriedCount} started${skippedCount > 0 ? `, ${skippedCount} skipped (already running)` : ''}${failedCount > 0 ? `, ${failedCount} failed to start` : ''}`;
        if (failedCount > 0) {
          showFailure({ message });
        } else {
          showSuccess({ message });
        }
        await refetch();
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to retry all summaries',
        });
      },
    }),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title order={1}>Failed Summaries</Title>
          <Text c="dimmed">
            {data.uploads.length} upload{data.uploads.length === 1 ? '' : 's'}{' '}
            whose summarize pipeline failed (primary and fallback model) and
            have no stored summary
          </Text>
        </div>
        {data.uploads.length > 0 ? (
          <Button
            variant="light"
            color="blue"
            leftSection={<IconRefresh size={16} />}
            onClick={() => retryAllMutation.mutate()}
            loading={retryAllMutation.isPending}
            disabled={regenerateMutation.isPending}
          >
            Retry All
          </Button>
        ) : null}
      </div>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Upload</Table.Th>
            <Table.Th>Channel</Table.Th>
            <Table.Th>Last attempt</Table.Th>
            <Table.Th>Outcome</Table.Th>
            <Table.Th>Model</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.uploads.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Text ta="center" c="dimmed" className="py-8">
                  No failed summaries
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            data.uploads.map((upload) => (
              <Table.Tr
                key={upload.id}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  navigate({
                    to: `/dashboard/channels/${upload.channel.id}/uploads/${upload.id}`,
                  });
                }}
              >
                <Table.Td>
                  <div style={{ maxWidth: 360 }}>
                    <Text fw={500} lineClamp={2} size="sm">
                      {upload.title || 'Untitled'}
                    </Text>
                    {upload.lastAttempt.errorMessage ? (
                      <Text
                        size="xs"
                        c="dimmed"
                        lineClamp={2}
                        className="mt-[2px]"
                      >
                        {upload.lastAttempt.errorMessage}
                      </Text>
                    ) : null}
                  </div>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {upload.channel.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    @{upload.channel.slug}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {formatDate(upload.lastAttempt.at, 'short')}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color="red" size="sm">
                    {upload.lastAttempt.outcome}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Code>{upload.lastAttempt.model}</Code>
                </Table.Td>
                <Table.Td onClick={(e) => e.stopPropagation()}>
                  <Tooltip label="Regenerate summary">
                    <ActionIcon
                      variant="light"
                      color="blue"
                      onClick={() =>
                        regenerateMutation.mutate({
                          uploadRecordId: upload.id,
                        })
                      }
                      loading={regenerateMutation.isPending}
                      disabled={retryAllMutation.isPending}
                    >
                      <IconRefresh size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>

      <div className="flex flex-wrap items-center justify-end gap-4">
        <Text size="xs" c="dimmed">
          The fallback model is set by{' '}
          <Code>OPENROUTER_SUMMARY_FALLBACK_MODEL</Code>. Both attempts are
          recorded in <Code>llm_call</Code>.
        </Text>
      </div>
    </div>
  );
}
