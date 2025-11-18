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
import {
  IconAlertCircle,
  IconCheck,
  IconPlayerPause,
  IconPlayerPlay,
  IconX,
} from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute(
  '/dashboard_/admin_/view-ranges-migration',
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
      trpc.dashboard.admin.getViewRangesMigrationStatus.queryOptions(),
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
  const [batchSize, setBatchSize] = useState<number | string>(100);
  const [delayMs, setDelayMs] = useState<number | string>(100);
  const [maxRows, setMaxRows] = useState<number | string>('');

  const { data: status, refetch } = useSuspenseQuery({
    ...trpc.dashboard.admin.getViewRangesMigrationStatus.queryOptions(),
    refetchInterval: 2000,
  });

  const startMutation = useMutation(
    trpc.dashboard.admin.startViewRangesMigration.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    }),
  );

  const cancelMutation = useMutation(
    trpc.dashboard.admin.cancelViewRangesMigration.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    }),
  );

  const isRunning = status.workflowStatus?.status === 'running';
  const isCompleted =
    status.workflowStatus?.status === 'completed' ||
    status.remainingCount === 0;
  const isFailed =
    status.workflowStatus?.status === 'failed' ||
    status.workflowStatus?.status === 'cancelled' ||
    status.workflowStatus?.status === 'terminated';

  const getStatusBadge = () => {
    if (isRunning) {
      return (
        <Badge color="blue" size="lg">
          Running
        </Badge>
      );
    }
    if (isCompleted) {
      return (
        <Badge color="green" size="lg" leftSection={<IconCheck size={14} />}>
          Completed
        </Badge>
      );
    }
    if (isFailed) {
      return (
        <Badge color="red" size="lg" leftSection={<IconX size={14} />}>
          {status.workflowStatus?.status || 'Failed'}
        </Badge>
      );
    }
    return (
      <Badge color="gray" size="lg">
        Not Started
      </Badge>
    );
  };

  const totalOriginal =
    status.remainingCount + (status.workflowStatus?.totalProcessed ?? 0);
  const progressPercent =
    totalOriginal > 0
      ? ((status.workflowStatus?.totalProcessed ?? 0) / totalOriginal) * 100
      : status.remainingCount === 0
        ? 100
        : 0;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1}>View Ranges Migration</Title>
          <Text c="dimmed">
            Migrate UploadViewRanges to UploadViewSecond table
          </Text>
        </div>
        {getStatusBadge()}
      </Group>

      <Card withBorder>
        <Stack gap="md">
          <Title order={3}>Migration Status</Title>

          <Group grow>
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">
                Remaining Rows
              </Text>
              <Text size="xl" fw={700}>
                {status.remainingCount.toLocaleString()}
              </Text>
            </Card>
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">
                Total Seconds Created
              </Text>
              <Text size="xl" fw={700}>
                {status.secondsCount.toLocaleString()}
              </Text>
            </Card>
            {status.workflowStatus ? (
              <>
                <Card withBorder p="md">
                  <Text size="sm" c="dimmed">
                    Rows Processed
                  </Text>
                  <Text size="xl" fw={700}>
                    {status.workflowStatus.totalProcessed.toLocaleString()}
                  </Text>
                </Card>
                <Card withBorder p="md">
                  <Text size="sm" c="dimmed">
                    Batches Completed
                  </Text>
                  <Text size="xl" fw={700}>
                    {status.workflowStatus.batchesCompleted.toLocaleString()}
                  </Text>
                </Card>
              </>
            ) : null}
          </Group>

          {(isRunning || progressPercent > 0) && (
            <div>
              <Text size="sm" mb="xs">
                Progress
              </Text>
              <Progress
                value={progressPercent}
                size="xl"
                animated={isRunning}
                striped={isRunning}
                color={isCompleted ? 'green' : undefined}
              />
              <Text size="sm" c="dimmed" mt="xs">
                {progressPercent.toFixed(1)}% complete
              </Text>
            </div>
          )}
        </Stack>
      </Card>

      {!isRunning && status.remainingCount > 0 && (
        <Card withBorder>
          <Stack gap="md">
            <Title order={3}>Start Migration</Title>

            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Important"
              color="yellow"
            >
              This migration will convert{' '}
              {status.remainingCount.toLocaleString()} UploadViewRanges rows to
              individual UploadViewSecond entries. Each range will be converted
              to individual seconds. This process is irreversible - old data
              will be deleted as it is migrated.
            </Alert>

            <Group grow>
              <NumberInput
                label="Batch Size"
                description="Number of rows to process per batch"
                value={batchSize}
                onChange={setBatchSize}
                min={1}
                max={1000}
              />
              <NumberInput
                label="Delay Between Batches (ms)"
                description="Milliseconds to wait between batches"
                value={delayMs}
                onChange={setDelayMs}
                min={0}
                max={10000}
              />
              <NumberInput
                label="Max Rows"
                description="Maximum rows to migrate (leave empty for all)"
                value={maxRows}
                onChange={setMaxRows}
                min={1}
                placeholder="All"
              />
            </Group>

            <Button
              leftSection={<IconPlayerPlay size={16} />}
              onClick={() =>
                startMutation.mutate({
                  batchSize: Number(batchSize),
                  delayBetweenBatchesMs: Number(delayMs),
                  maxRows: maxRows === '' ? undefined : Number(maxRows),
                })
              }
              loading={startMutation.isPending}
              disabled={status.remainingCount === 0}
            >
              Start Migration
            </Button>

            {startMutation.error && (
              <Alert color="red" title="Error">
                {startMutation.error.message}
              </Alert>
            )}
          </Stack>
        </Card>
      )}

      {isRunning && (
        <Card withBorder>
          <Stack gap="md">
            <Title order={3}>Control</Title>

            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Migration Running"
              color="blue"
            >
              The migration is currently running. You can cancel it if needed,
              but already processed batches will not be rolled back.
            </Alert>

            <Button
              color="red"
              leftSection={<IconPlayerPause size={16} />}
              onClick={() => cancelMutation.mutate()}
              loading={cancelMutation.isPending}
            >
              Cancel Migration
            </Button>

            {cancelMutation.error && (
              <Alert color="red" title="Error">
                {cancelMutation.error.message}
              </Alert>
            )}
          </Stack>
        </Card>
      )}

      {isCompleted && status.remainingCount === 0 && (
        <Alert
          icon={<IconCheck size={16} />}
          title="Migration Complete"
          color="green"
        >
          All UploadViewRanges have been successfully migrated to
          UploadViewSecond. The old table can now be safely dropped if desired.
        </Alert>
      )}
    </Stack>
  );
}
