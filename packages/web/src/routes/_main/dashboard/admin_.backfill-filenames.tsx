import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Progress,
  Text,
  TextInput,
  Title,
} from '@/components/ui';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute(
  '/_main/dashboard/admin_/backfill-filenames',
)({
  component: BackfillFilenamesPage,
  beforeLoad: async ({ context }) => {
    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );
    if (currentUser?.role !== 'ADMIN') {
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    return {
      initialData: await queryClient.ensureQueryData(
        trpc.dashboard.admin.getBackfillFilenamesStatus.queryOptions(),
      ),
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
});

function BackfillFilenamesPage() {
  const trpc = useTRPC();
  const [batchSize, setBatchSize] = useState<number | string>(50);
  const [delayMs, setDelayMs] = useState<number | string>(500);

  const { data: status, refetch } = useSuspenseQuery({
    ...trpc.dashboard.admin.getBackfillFilenamesStatus.queryOptions(),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.workflowStatus?.status === 'running' ? 2000 : false;
    },
  });

  const startMutation = useMutation(
    trpc.dashboard.admin.startBackfillFilenames.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Backfill started successfully' });
        refetch();
      },
      onError: (error) => {
        showFailure({
          message:
            error instanceof Error ? error.message : 'Failed to start backfill',
        });
      },
    }),
  );

  const cancelMutation = useMutation(
    trpc.dashboard.admin.cancelBackfillFilenames.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Backfill cancelled' });
        refetch();
      },
      onError: (error) => {
        showFailure({
          message:
            error instanceof Error
              ? error.message
              : 'Failed to cancel backfill',
        });
      },
    }),
  );

  const isRunning = status.workflowStatus?.status === 'running';
  const isCompleted = status.workflowStatus?.status === 'completed';
  const progress = status.workflowStatus;

  const progressPercent =
    progress && 'totalProcessed' in progress && 'remaining' in progress
      ? Math.round(
          (progress.totalProcessed /
            (progress.totalProcessed + progress.remaining)) *
            100,
        )
      : 0;

  const getStatusBadge = () => {
    if (isRunning) return <Badge color="blue">Running</Badge>;
    if (isCompleted) return <Badge color="green">Completed</Badge>;
    if (status.workflowStatus?.status === 'cancelled')
      return <Badge color="yellow">Cancelled</Badge>;
    if (status.workflowStatus?.status === 'failed')
      return <Badge color="red">Failed</Badge>;
    return <Badge color="gray">Not Started</Badge>;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title order={1}>Backfill Original Filenames</Title>
          <Text c="dimmed">
            Detect and populate original filenames for existing uploads
          </Text>
        </div>
        {getStatusBadge()}
      </div>

      <Alert icon={<IconAlertCircle size={16} />} color="blue">
        <Text size="sm">
          This job will analyze uploads that don't have an original filename and
          attempt to detect the file type using S3 ContentType header or
          file-type detection, then create a filename based on the upload title
          and detected extension.
        </Text>
      </Alert>

      <div className="overflow-hidden rounded-xl border-fancy-pants bg-white p-4 dark:bg-zinc-900">
        <div className="flex flex-col gap-4">
          <Title order={3}>Status</Title>

          <div className="flex flex-wrap items-center justify-start gap-4">
            <div style={{ flex: 1 }}>
              <Text size="sm" c="dimmed">
                Remaining uploads to process
              </Text>
              <Text size="xl" fw={700}>
                {status.remainingCount.toLocaleString()}
              </Text>
            </div>

            {progress && 'totalProcessed' in progress ? (
              <>
                <div style={{ flex: 1 }}>
                  <Text size="sm" c="dimmed">
                    Processed
                  </Text>
                  <Text size="xl" fw={700}>
                    {progress.totalProcessed.toLocaleString()}
                  </Text>
                </div>

                <div style={{ flex: 1 }}>
                  <Text size="sm" c="dimmed">
                    Updated
                  </Text>
                  <Text size="xl" fw={700}>
                    {progress.totalUpdated.toLocaleString()}
                  </Text>
                </div>
              </>
            ) : null}
          </div>

          {isRunning ? (
            <div>
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
                <Text size="sm" fw={500}>
                  Progress
                </Text>
                <Text size="sm" c="dimmed">
                  {progressPercent}%
                </Text>
              </div>
              <Progress value={progressPercent} animated />
            </div>
          ) : null}
        </div>
      </div>

      {!isRunning && status.remainingCount > 0 ? (
        <div className="overflow-hidden rounded-xl border-fancy-pants bg-white p-4 dark:bg-zinc-900">
          <div className="flex flex-col gap-4">
            <Title order={3}>Start Backfill</Title>

            <TextInput
              label="Batch Size"
              description="Number of uploads to process per batch"
              type="number"
              value={String(batchSize)}
              onChange={(e) => setBatchSize(e.currentTarget.value)}
              min={1}
              max={1000}
            />

            <TextInput
              label="Delay Between Batches (ms)"
              description="Delay in milliseconds between batches to reduce load"
              type="number"
              value={String(delayMs)}
              onChange={(e) => setDelayMs(e.currentTarget.value)}
              min={0}
              max={10000}
            />

            <Button
              onClick={() =>
                startMutation.mutate({
                  batchSize: Number(batchSize),
                  delayBetweenBatchesMs: Number(delayMs),
                })
              }
              loading={startMutation.isPending}
            >
              Start Backfill
            </Button>
          </div>
        </div>
      ) : null}

      {isRunning ? (
        <Button
          color="red"
          onClick={() => cancelMutation.mutate()}
          loading={cancelMutation.isPending}
        >
          Cancel Backfill
        </Button>
      ) : null}

      {isCompleted && status.remainingCount === 0 ? (
        <Alert icon={<IconCheck size={16} />} color="green">
          <Text size="sm">
            Backfill completed successfully! All uploads have been processed.
          </Text>
        </Alert>
      ) : null}
    </div>
  );
}
