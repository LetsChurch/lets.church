import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Badge, Button, Progress, Text, Title } from '@/components/ui';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import type { ReindexKind } from '@/temporal';
import { useTRPC } from '@/trpc/react';

function ProgressBar({ value }: { value: number }) {
  return <Progress value={value} size="sm" animated />;
}

export const Route = createFileRoute('/_main/dashboard/admin_/reindex')({
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

const KINDS: ReindexKind[] = ['channel', 'organization', 'media', 'speaker'];

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
    <div className="flex flex-col gap-5">
      <div>
        <Title order={1}>Reindex Elasticsearch</Title>
        <Text c="dimmed">
          Rebuild search indices from the database. Each index can be run
          independently.
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {KINDS.map((kind) => {
          const s = status[kind];
          const isRunning = s?.status === 'running';
          const progressPercent =
            s?.status === 'running' && s.total > 0
              ? Math.round((s.totalIndexed / s.total) * 100)
              : 0;
          const { label, description } = KIND_LABELS[kind];

          return (
            <div
              key={kind}
              className="overflow-hidden rounded-xl border-fancy-pants bg-white dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <Text fw={600}>{label}</Text>
                  {statusBadge(s?.status)}
                </div>

                <Text size="sm" c="dimmed">
                  {description}
                </Text>

                {isRunning && s.total > 0 ? (
                  <div>
                    <div className="mb-[4px] flex flex-wrap items-center justify-between gap-4">
                      <Text size="xs" c="dimmed">
                        {s.totalIndexed.toLocaleString()} /{' '}
                        {s.total.toLocaleString()}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {progressPercent}%
                      </Text>
                    </div>
                    <ProgressBar value={progressPercent} />
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
