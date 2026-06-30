import {
  Badge,
  Button,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import type { ReindexKind } from '@/temporal';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute('/dashboard_/admin_/reindex')({
  component: ReindexPage,
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
      trpc.dashboard.admin.getReindexStatus.queryOptions(),
    );
    return {
      backNavigation: { label: 'Admin', to: '/dashboard/admin' },
    };
  },
});

const KIND_LABELS: Record<ReindexKind, { label: string; description: string }> =
  {
    upload: {
      label: 'Uploads',
      description: 'Title, description, and metadata for all upload records',
    },
    transcript: {
      label: 'Transcripts',
      description: 'Full-text transcript content for transcribed uploads',
    },
    channel: {
      label: 'Channels',
      description: 'Channel names and visibility',
    },
    organization: {
      label: 'Organizations',
      description: 'Church and ministry names, tags, and locations',
    },
    media: {
      label: 'Media (search)',
      description:
        'The unified lc_media_v1 index that powers the main search — summaries, embeddings, paragraphs, speakers, and Bible refs (uploads with a summary embedding). Also re-syncs their speaker vectors.',
    },
    speaker: {
      label: 'Speaker vectors',
      description:
        'Voice vectors (lc_speaker_vectors) for speaker-labeling suggestions, for every upload with speaker attributions.',
    },
  };

const KINDS: ReindexKind[] = [
  'upload',
  'transcript',
  'channel',
  'organization',
  'media',
  'speaker',
];

function statusBadge(status: string | undefined) {
  if (!status) return <Badge color="gray">Idle</Badge>;
  if (status === 'running') return <Badge color="blue">Running</Badge>;
  if (status === 'completed') return <Badge color="green">Completed</Badge>;
  if (status === 'cancelled') return <Badge color="yellow">Cancelled</Badge>;
  if (status === 'failed') return <Badge color="red">Failed</Badge>;
  return <Badge color="gray">Idle</Badge>;
}

function ReindexPage() {
  const trpc = useTRPC();

  const { data: status, refetch } = useSuspenseQuery({
    ...trpc.dashboard.admin.getReindexStatus.queryOptions(),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      return Object.values(d).some((s) => s?.status === 'running')
        ? 2000
        : false;
    },
  });

  const startMutation = useMutation(
    trpc.dashboard.admin.startReindex.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Reindex started' });
        refetch();
      },
      onError: (err) => {
        showFailure({
          message:
            err instanceof Error ? err.message : 'Failed to start reindex',
        });
      },
    }),
  );

  const cancelMutation = useMutation(
    trpc.dashboard.admin.cancelReindex.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Reindex cancelled' });
        refetch();
      },
      onError: (err) => {
        showFailure({
          message:
            err instanceof Error ? err.message : 'Failed to cancel reindex',
        });
      },
    }),
  );

  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>Reindex Elasticsearch</Title>
        <Text c="dimmed">
          Rebuild search indices from the database. Each index can be run
          independently.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {KINDS.map((kind) => {
          const s = status[kind];
          const isRunning = s?.status === 'running';
          const progressPercent =
            s?.status === 'running' && s.total > 0
              ? Math.round((s.totalIndexed / s.total) * 100)
              : 0;
          const { label, description } = KIND_LABELS[kind];

          return (
            <Card key={kind} withBorder>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={600}>{label}</Text>
                  {statusBadge(s?.status)}
                </Group>

                <Text size="sm" c="dimmed">
                  {description}
                </Text>

                {isRunning && s.total > 0 ? (
                  <div>
                    <Group justify="space-between" mb={4}>
                      <Text size="xs" c="dimmed">
                        {s.totalIndexed.toLocaleString()} /{' '}
                        {s.total.toLocaleString()}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {progressPercent}%
                      </Text>
                    </Group>
                    <Progress value={progressPercent} animated size="sm" />
                  </div>
                ) : null}

                {isRunning ? (
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
                    loading={
                      cancelMutation.isPending &&
                      cancelMutation.variables?.kind === kind
                    }
                    onClick={() => cancelMutation.mutate({ kind })}
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    loading={
                      startMutation.isPending &&
                      startMutation.variables?.kind === kind
                    }
                    onClick={() => startMutation.mutate({ kind })}
                  >
                    Start
                  </Button>
                )}
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
