import {
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useDeferredValue, useState } from 'react';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute('/dashboard_/admin_/remux')({
  component: RemuxPage,
  beforeLoad: async ({ context }) => {
    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );
    if (currentUser?.role !== 'ADMIN') {
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.admin.getRemuxStatus.queryOptions(),
    );
    return { backNavigation: { label: 'Admin', to: '/dashboard/admin' } };
  },
});

function statusBadge(status: string | null | undefined) {
  if (!status) return <Badge color="gray">Idle</Badge>;
  if (status === 'running') return <Badge color="blue">Running</Badge>;
  if (status === 'completed') return <Badge color="green">Completed</Badge>;
  if (status === 'cancelled') return <Badge color="yellow">Cancelled</Badge>;
  if (status === 'failed') return <Badge color="red">Failed</Badge>;
  return <Badge color="gray">Idle</Badge>;
}

function RemuxPage() {
  const trpc = useTRPC();
  const [channelSlug, setChannelSlug] = useState('');
  const deferredChannelSlug = useDeferredValue(channelSlug);

  const { data: status, refetch: refetchStatus } = useSuspenseQuery({
    ...trpc.dashboard.admin.getRemuxStatus.queryOptions(),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      return d.legacyStatus === 'running' ? 3000 : false;
    },
  });

  const { data: channelStatus, refetch: refetchChannelStatus } = useQuery({
    ...trpc.dashboard.admin.getChannelRemuxStatus.queryOptions({
      channelSlug: deferredChannelSlug,
    }),
    enabled: deferredChannelSlug.length > 0,
    refetchInterval: (query) => (query.state.data === 'running' ? 3000 : false),
  });

  const startMutation = useMutation(
    trpc.dashboard.admin.startRemux.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Remux started' });
        refetchStatus();
        refetchChannelStatus();
      },
      onError: (err) => {
        showFailure({
          message: err instanceof Error ? err.message : 'Failed to start',
        });
      },
    }),
  );

  const cancelMutation = useMutation(
    trpc.dashboard.admin.cancelRemux.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Remux cancelled' });
        refetchStatus();
        refetchChannelStatus();
      },
      onError: (err) => {
        showFailure({
          message: err instanceof Error ? err.message : 'Failed to cancel',
        });
      },
    }),
  );

  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>Remux Media</Title>
        <Text c="dimmed">
          Losslessly convert v1 (MPEG-TS) uploads to v2 (fMP4) format. Jobs run
          at lowest priority and won&apos;t disrupt normal uploads.
        </Text>
      </div>

      {/* Legacy migration */}
      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <div>
              <Text fw={600}>Pipeline Version Migration</Text>
              <Text size="sm" c="dimmed">
                Uploads still using MPEG-TS segments (pipeline v1). Run this to
                convert all legacy content to fMP4 without re-encoding.
              </Text>
            </div>
            {statusBadge(status.legacyStatus)}
          </Group>

          <Group>
            <Text size="sm" c="dimmed">
              Remaining:
            </Text>
            <Text size="sm" fw={500}>
              {status.legacyCount.toLocaleString()} uploads
            </Text>
          </Group>

          {status.legacyStatus === 'running' ? (
            <Button
              size="xs"
              color="red"
              variant="light"
              loading={
                cancelMutation.isPending &&
                cancelMutation.variables?.scope.kind === 'legacy'
              }
              onClick={() =>
                cancelMutation.mutate({ scope: { kind: 'legacy' } })
              }
            >
              Cancel
            </Button>
          ) : (
            <Button
              size="xs"
              disabled={status.legacyCount === 0}
              loading={
                startMutation.isPending &&
                startMutation.variables?.scope.kind === 'legacy'
              }
              onClick={() =>
                startMutation.mutate({ scope: { kind: 'legacy' } })
              }
            >
              {status.legacyCount === 0
                ? 'Migration complete'
                : 'Start migration'}
            </Button>
          )}
        </Stack>
      </Card>

      {/* By channel */}
      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <div>
              <Text fw={600}>By Channel</Text>
              <Text size="sm" c="dimmed">
                Remux all v1 uploads for a specific channel. Useful for testing
                or targeted migration.
              </Text>
            </div>
            {channelSlug.length > 0 ? statusBadge(channelStatus) : null}
          </Group>

          <TextInput
            placeholder="channel-slug"
            value={channelSlug}
            onChange={(e) => setChannelSlug(e.currentTarget.value)}
            label="Channel slug"
          />

          {channelStatus === 'running' ? (
            <Button
              size="xs"
              color="red"
              variant="light"
              loading={
                cancelMutation.isPending &&
                cancelMutation.variables?.scope.kind === 'channel'
              }
              onClick={() =>
                cancelMutation.mutate({
                  scope: { kind: 'channel', channelSlug: channelSlug.trim() },
                })
              }
            >
              Cancel
            </Button>
          ) : (
            <Button
              size="xs"
              disabled={channelSlug.trim().length === 0}
              loading={
                startMutation.isPending &&
                startMutation.variables?.scope.kind === 'channel'
              }
              onClick={() =>
                startMutation.mutate({
                  scope: { kind: 'channel', channelSlug: channelSlug.trim() },
                })
              }
            >
              Start for channel
            </Button>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
