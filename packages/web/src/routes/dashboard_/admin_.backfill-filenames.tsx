import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Progress,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute('/dashboard_/admin_/backfill-filenames')({
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
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1}>Backfill Original Filenames</Title>
          <Text c="dimmed">
            Detect and populate original filenames for existing uploads
          </Text>
        </div>
        {getStatusBadge()}
      </Group>

      <Alert icon={<IconAlertCircle size={16} />} color="blue">
        <Text size="sm">
          This job will analyze uploads that don't have an original filename and
          attempt to detect the file type using S3 ContentType header or
          file-type detection, then create a filename based on the upload title
          and detected extension.
        </Text>
      </Alert>

      <Card withBorder>
        <Stack gap="md">
          <Title order={3}>Status</Title>

          <Group>
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
          </Group>

          {isRunning ? (
            <div>
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={500}>
                  Progress
                </Text>
                <Text size="sm" c="dimmed">
                  {progressPercent}%
                </Text>
              </Group>
              <Progress value={progressPercent} animated />
            </div>
          ) : null}
        </Stack>
      </Card>

      {!isRunning && status.remainingCount > 0 ? (
        <Card withBorder>
          <Stack gap="md">
            <Title order={3}>Start Backfill</Title>

            <NumberInput
              label="Batch Size"
              description="Number of uploads to process per batch"
              value={batchSize}
              onChange={setBatchSize}
              min={1}
              max={1000}
            />

            <NumberInput
              label="Delay Between Batches (ms)"
              description="Delay in milliseconds between batches to reduce load"
              value={delayMs}
              onChange={setDelayMs}
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
          </Stack>
        </Card>
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
    </Stack>
  );
}
