import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useDeferredValue, useState } from 'react';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute('/dashboard_/admin_/reprocess')({
  component: ReprocessPage,
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
      trpc.dashboard.admin.getReprocessStatus.queryOptions(),
    );
    return { backNavigation: { label: 'Admin', to: '/dashboard/admin' } };
  },
});

type ProcessingScope = 'transcode' | 'transcribe' | 'everything';

const processingScopeData = [
  { value: 'transcode', label: 'Transcode' },
  { value: 'transcribe', label: 'Transcribe' },
  { value: 'everything', label: 'Everything' },
];

function statusBadge(status: string | null | undefined) {
  if (!status) return <Badge color="gray">Idle</Badge>;
  if (status === 'running') return <Badge color="blue">Running</Badge>;
  if (status === 'completed') return <Badge color="green">Completed</Badge>;
  if (status === 'cancelled') return <Badge color="yellow">Cancelled</Badge>;
  if (status === 'failed') return <Badge color="red">Failed</Badge>;
  return <Badge color="gray">Idle</Badge>;
}

function ReprocessPage() {
  const trpc = useTRPC();
  const [channelSlug, setChannelSlug] = useState('');
  const deferredChannelSlug = useDeferredValue(channelSlug);

  const [legacyProcessingScope, setLegacyProcessingScope] =
    useState<ProcessingScope>('transcode');
  const [channelProcessingScope, setChannelProcessingScope] =
    useState<ProcessingScope>('transcode');
  const [allProcessingScope, setAllProcessingScope] =
    useState<ProcessingScope>('transcode');

  const { data: status, refetch: refetchStatus } = useSuspenseQuery({
    ...trpc.dashboard.admin.getReprocessStatus.queryOptions(),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      return d.legacyStatus === 'running' || d.allStatus === 'running'
        ? 3000
        : false;
    },
  });

  const { data: channelStatus, refetch: refetchChannelStatus } = useQuery({
    ...trpc.dashboard.admin.getChannelReprocessStatus.queryOptions({
      channelSlug: deferredChannelSlug,
    }),
    enabled: deferredChannelSlug.length > 0,
    refetchInterval: (query) => (query.state.data === 'running' ? 3000 : false),
  });

  const startMutation = useMutation(
    trpc.dashboard.admin.startReprocess.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Reprocess started' });
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
    trpc.dashboard.admin.cancelReprocess.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Reprocess cancelled' });
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
        <Title order={1}>Reprocess Media</Title>
        <Text c="dimmed">
          Re-run uploads through the current pipeline. Jobs run at lowest
          priority and won't disrupt normal uploads.
        </Text>
      </div>

      {/* Legacy migration */}
      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <div>
              <Text fw={600}>Pipeline Version Migration</Text>
              <Text size="sm" c="dimmed">
                Uploads processed by an older pipeline version. Run this to
                bring all legacy content up to the current pipeline.
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

          <SegmentedControl
            size="xs"
            value={legacyProcessingScope}
            onChange={(v) => setLegacyProcessingScope(v as ProcessingScope)}
            data={processingScopeData}
            disabled={status.legacyStatus === 'running'}
          />

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
                startMutation.mutate({
                  scope: { kind: 'legacy' },
                  processingScope: legacyProcessingScope,
                })
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
                Reprocess all finalized uploads for a specific channel. Useful
                for testing or targeted fixes.
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

          <SegmentedControl
            size="xs"
            value={channelProcessingScope}
            onChange={(v) => setChannelProcessingScope(v as ProcessingScope)}
            data={processingScopeData}
            disabled={channelStatus === 'running'}
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
                  processingScope: channelProcessingScope,
                })
              }
            >
              Start for channel
            </Button>
          )}
        </Stack>
      </Card>

      {/* All uploads */}
      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <div>
              <Text fw={600}>All Uploads</Text>
              <Text size="sm" c="dimmed">
                Reprocess every finalized upload. Use if the pipeline changes
                and a full rebuild is needed.
              </Text>
            </div>
            {statusBadge(status.allStatus)}
          </Group>

          <Alert icon={<IconAlertTriangle size={16} />} color="orange">
            <Text size="sm">
              This will queue every upload in the system. It may take days to
              complete at lowest priority.
            </Text>
          </Alert>

          <SegmentedControl
            size="xs"
            value={allProcessingScope}
            onChange={(v) => setAllProcessingScope(v as ProcessingScope)}
            data={processingScopeData}
            disabled={status.allStatus === 'running'}
          />

          {status.allStatus === 'running' ? (
            <Button
              size="xs"
              color="red"
              variant="light"
              loading={
                cancelMutation.isPending &&
                cancelMutation.variables?.scope.kind === 'all'
              }
              onClick={() => cancelMutation.mutate({ scope: { kind: 'all' } })}
            >
              Cancel
            </Button>
          ) : (
            <Button
              size="xs"
              color="orange"
              loading={
                startMutation.isPending &&
                startMutation.variables?.scope.kind === 'all'
              }
              onClick={() =>
                startMutation.mutate({
                  scope: { kind: 'all' },
                  processingScope: allProcessingScope,
                })
              }
            >
              Start full reprocess
            </Button>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
