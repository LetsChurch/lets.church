import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Progress,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArchive,
  IconCheck,
  IconCloudUpload,
  IconDatabase,
  IconPlayerPause,
  IconPlayerPlay,
  IconX,
} from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/dashboard_/admin_/upload-backups')({
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
      trpc.dashboard.admin.getUploadBackupStats.queryOptions(),
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
  const [backfillBatchSize, setBackfillBatchSize] = useState<number | string>(
    100,
  );
  const [backfillDelayMs, setBackfillDelayMs] = useState<number | string>(100);
  const [backfillMaxRows, setBackfillMaxRows] = useState<number | string>('');

  const [backupBatchSize, setBackupBatchSize] = useState<number | string>(10);
  const [backupDelayMs, setBackupDelayMs] = useState<number | string>(1000);
  const [backupMaxUploads, setBackupMaxUploads] = useState<number | string>('');

  const { data: status, refetch } = useSuspenseQuery({
    ...trpc.dashboard.admin.getUploadBackupStats.queryOptions(),
    refetchInterval: 2000,
  });

  const { data: failedBackups } = useSuspenseQuery({
    ...trpc.dashboard.admin.getFailedBackups.queryOptions({
      limit: 10,
      offset: 0,
    }),
    refetchInterval: 5000,
  });

  const startBackfillMutation = useMutation(
    trpc.dashboard.admin.startBackfillUploadStates.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    }),
  );

  const cancelBackfillMutation = useMutation(
    trpc.dashboard.admin.cancelBackfillUploadStates.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    }),
  );

  const startBackupMutation = useMutation(
    trpc.dashboard.admin.startBulkBackupToGlacier.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    }),
  );

  const cancelBackupMutation = useMutation(
    trpc.dashboard.admin.cancelBulkBackupToGlacier.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    }),
  );

  const isBackfillRunning = status.backfillStatus?.status === 'running';
  const isBackupRunning = status.bulkBackupStatus?.status === 'running';

  const getStatusBadge = (
    workflowStatus: { status: string } | null | undefined,
  ) => {
    if (workflowStatus?.status === 'running') {
      return (
        <Badge color="blue" size="sm">
          Running
        </Badge>
      );
    }
    if (workflowStatus?.status === 'completed') {
      return (
        <Badge color="green" size="sm" leftSection={<IconCheck size={12} />}>
          Completed
        </Badge>
      );
    }
    if (
      workflowStatus?.status === 'failed' ||
      workflowStatus?.status === 'cancelled' ||
      workflowStatus?.status === 'terminated'
    ) {
      return (
        <Badge color="red" size="sm" leftSection={<IconX size={12} />}>
          {workflowStatus.status}
        </Badge>
      );
    }
    return (
      <Badge color="gray" size="sm">
        Not Started
      </Badge>
    );
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1}>Upload Backups</Title>
          <Text c="dimmed">
            Manage Glacier Deep Archive backups for uploaded files
          </Text>
        </div>
      </Group>

      {/* Stats Overview */}
      <Card withBorder>
        <Stack gap="md">
          <Title order={3}>Backup Statistics</Title>

          <Group grow>
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">
                Total Tracked
              </Text>
              <Text size="xl" fw={700}>
                {status.stats.total.toLocaleString()}
              </Text>
            </Card>
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">
                Not Backed Up
              </Text>
              <Text size="xl" fw={700} c="orange">
                {status.stats.notBackedUp.toLocaleString()}
              </Text>
            </Card>
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">
                Backing Up
              </Text>
              <Text size="xl" fw={700} c="blue">
                {status.stats.backingUp.toLocaleString()}
              </Text>
            </Card>
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">
                Backed Up
              </Text>
              <Text size="xl" fw={700} c="green">
                {status.stats.backedUp.toLocaleString()}
              </Text>
            </Card>
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">
                Failed
              </Text>
              <Text size="xl" fw={700} c="red">
                {status.stats.backupFailed.toLocaleString()}
              </Text>
            </Card>
          </Group>

          {status.stats.total > 0 && (
            <div>
              <Text size="sm" mb="xs">
                Backup Progress
              </Text>
              <Progress
                value={(status.stats.backedUp / status.stats.total) * 100}
                size="xl"
                color="green"
              />
              <Text size="sm" c="dimmed" mt="xs">
                {((status.stats.backedUp / status.stats.total) * 100).toFixed(
                  1,
                )}
                % backed up
              </Text>
            </div>
          )}
        </Stack>
      </Card>

      {/* Backfill Section */}
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3}>
              <Group gap="xs">
                <IconDatabase size={20} />
                Backfill Upload States
              </Group>
            </Title>
            {getStatusBadge(status.backfillStatus)}
          </Group>

          <Text size="sm" c="dimmed">
            Create UploadState records for existing uploads in the database that
            are not yet tracked. These will be marked as "not backed up".
          </Text>

          {isBackfillRunning && status.backfillStatus ? (
            <>
              <Group grow>
                <Card withBorder p="sm">
                  <Text size="xs" c="dimmed">
                    Created
                  </Text>
                  <Text fw={600}>
                    {status.backfillStatus.totalCreated?.toLocaleString() ?? 0}
                  </Text>
                </Card>
                <Card withBorder p="sm">
                  <Text size="xs" c="dimmed">
                    Remaining
                  </Text>
                  <Text fw={600}>
                    {status.backfillStatus.remaining?.toLocaleString() ?? 0}
                  </Text>
                </Card>
                <Card withBorder p="sm">
                  <Text size="xs" c="dimmed">
                    Batches
                  </Text>
                  <Text fw={600}>
                    {status.backfillStatus.batchesCompleted?.toLocaleString() ??
                      0}
                  </Text>
                </Card>
              </Group>

              <Button
                color="red"
                leftSection={<IconPlayerPause size={16} />}
                onClick={() => cancelBackfillMutation.mutate()}
                loading={cancelBackfillMutation.isPending}
              >
                Cancel Backfill
              </Button>
            </>
          ) : (
            <>
              <Group grow>
                <NumberInput
                  label="Batch Size"
                  description="Records per batch"
                  value={backfillBatchSize}
                  onChange={setBackfillBatchSize}
                  min={1}
                  max={1000}
                  size="sm"
                />
                <NumberInput
                  label="Delay (ms)"
                  description="Between batches"
                  value={backfillDelayMs}
                  onChange={setBackfillDelayMs}
                  min={0}
                  max={10000}
                  size="sm"
                />
                <NumberInput
                  label="Max Rows"
                  description="Leave empty for all"
                  value={backfillMaxRows}
                  onChange={setBackfillMaxRows}
                  min={1}
                  placeholder="All"
                  size="sm"
                />
              </Group>

              <Button
                leftSection={<IconPlayerPlay size={16} />}
                onClick={() =>
                  startBackfillMutation.mutate({
                    batchSize: Number(backfillBatchSize),
                    delayBetweenBatchesMs: Number(backfillDelayMs),
                    maxRows:
                      backfillMaxRows === ''
                        ? undefined
                        : Number(backfillMaxRows),
                  })
                }
                loading={startBackfillMutation.isPending}
              >
                Start Backfill
              </Button>

              {startBackfillMutation.error && (
                <Alert color="red" title="Error">
                  {startBackfillMutation.error.message}
                </Alert>
              )}
            </>
          )}
        </Stack>
      </Card>

      {/* Bulk Backup Section */}
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3}>
              <Group gap="xs">
                <IconArchive size={20} />
                Bulk Backup to Glacier
              </Group>
            </Title>
            {getStatusBadge(status.bulkBackupStatus)}
          </Group>

          <Text size="sm" c="dimmed">
            Start backup jobs for all uploads that are not yet backed up to
            Glacier Deep Archive.
          </Text>

          {status.stats.notBackedUp === 0 && !isBackupRunning ? (
            <Alert
              icon={<IconCheck size={16} />}
              title="All Backed Up"
              color="green"
            >
              All tracked uploads have been backed up to Glacier.
            </Alert>
          ) : isBackupRunning && status.bulkBackupStatus ? (
            <>
              <Group grow>
                <Card withBorder p="sm">
                  <Text size="xs" c="dimmed">
                    Jobs Started
                  </Text>
                  <Text fw={600}>
                    {status.bulkBackupStatus.totalStarted?.toLocaleString() ??
                      0}
                  </Text>
                </Card>
                <Card withBorder p="sm">
                  <Text size="xs" c="dimmed">
                    Remaining
                  </Text>
                  <Text fw={600}>
                    {status.bulkBackupStatus.remaining?.toLocaleString() ?? 0}
                  </Text>
                </Card>
                <Card withBorder p="sm">
                  <Text size="xs" c="dimmed">
                    Batches
                  </Text>
                  <Text fw={600}>
                    {status.bulkBackupStatus.batchesCompleted?.toLocaleString() ??
                      0}
                  </Text>
                </Card>
              </Group>

              <Button
                color="red"
                leftSection={<IconPlayerPause size={16} />}
                onClick={() => cancelBackupMutation.mutate()}
                loading={cancelBackupMutation.isPending}
              >
                Cancel Backup
              </Button>
            </>
          ) : (
            <>
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Note"
                color="yellow"
              >
                {status.stats.notBackedUp.toLocaleString()} uploads need to be
                backed up. Glacier Deep Archive has retrieval times of 12-48
                hours and is intended for long-term storage.
              </Alert>

              <Group grow>
                <NumberInput
                  label="Batch Size"
                  description="Jobs per batch"
                  value={backupBatchSize}
                  onChange={setBackupBatchSize}
                  min={1}
                  max={100}
                  size="sm"
                />
                <NumberInput
                  label="Delay (ms)"
                  description="Between batches"
                  value={backupDelayMs}
                  onChange={setBackupDelayMs}
                  min={0}
                  max={60000}
                  size="sm"
                />
                <NumberInput
                  label="Max Uploads"
                  description="Leave empty for all"
                  value={backupMaxUploads}
                  onChange={setBackupMaxUploads}
                  min={1}
                  placeholder="All"
                  size="sm"
                />
              </Group>

              <Button
                leftSection={<IconCloudUpload size={16} />}
                onClick={() =>
                  startBackupMutation.mutate({
                    batchSize: Number(backupBatchSize),
                    delayBetweenBatchesMs: Number(backupDelayMs),
                    maxUploads:
                      backupMaxUploads === ''
                        ? undefined
                        : Number(backupMaxUploads),
                  })
                }
                loading={startBackupMutation.isPending}
                disabled={status.stats.notBackedUp === 0}
              >
                Start Bulk Backup
              </Button>

              {startBackupMutation.error && (
                <Alert color="red" title="Error">
                  {startBackupMutation.error.message}
                </Alert>
              )}
            </>
          )}
        </Stack>
      </Card>

      {/* Failed Backups Section */}
      {failedBackups.totalCount > 0 && (
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={3}>
                <Group gap="xs">
                  <IconX size={20} />
                  Failed Backups
                </Group>
              </Title>
              <Badge color="red">{failedBackups.totalCount} total</Badge>
            </Group>

            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>S3 Key</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>Upload</Table.Th>
                  <Table.Th>Failed At</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {failedBackups.failedBackups.map((backup) => (
                  <Table.Tr key={backup.id}>
                    <Table.Td>
                      <Badge size="xs" variant="light">
                        {backup.uploadType}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" style={{ wordBreak: 'break-all' }}>
                        {backup.s3Key.length > 40
                          ? `${backup.s3Key.substring(0, 40)}...`
                          : backup.s3Key}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {backup.sizeBytes
                        ? `${(Number(backup.sizeBytes) / 1024 / 1024).toFixed(1)} MB`
                        : '-'}
                    </Table.Td>
                    <Table.Td>
                      {backup.uploadRecord?.title
                        ? backup.uploadRecord.title.substring(0, 20)
                        : '-'}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">
                        {new Date(backup.updatedAt).toLocaleDateString()}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
