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
  IconFileInfo,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconTrash,
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

  const [cleanupBatchSize, setCleanupBatchSize] = useState<number | string>(
    100,
  );
  const [cleanupDelayMs, setCleanupDelayMs] = useState<number | string>(100);
  const [cleanupOlderThanDays, setCleanupOlderThanDays] = useState<
    number | string
  >(30);
  const [cleanupMaxRows, setCleanupMaxRows] = useState<number | string>('');

  const [backupBatchSize, setBackupBatchSize] = useState<number | string>(10);
  const [backupDelayMs, setBackupDelayMs] = useState<number | string>(1000);
  const [backupMaxUploads, setBackupMaxUploads] = useState<number | string>('');

  const [sizesBatchSize, setSizesBatchSize] = useState<number | string>(100);
  const [sizesDelayMs, setSizesDelayMs] = useState<number | string>(500);
  const [sizesMaxRows, setSizesMaxRows] = useState<number | string>('');

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

  const startCleanupMutation = useMutation(
    trpc.dashboard.admin.startCleanupStaleUploadStates.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    }),
  );

  const cancelCleanupMutation = useMutation(
    trpc.dashboard.admin.cancelCleanupStaleUploadStates.mutationOptions({
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

  const startSizesMutation = useMutation(
    trpc.dashboard.admin.startBackfillUploadStateSizes.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    }),
  );

  const cancelSizesMutation = useMutation(
    trpc.dashboard.admin.cancelBackfillUploadStateSizes.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    }),
  );

  const retryFailedBackupMutation = useMutation(
    trpc.dashboard.admin.retryFailedBackup.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    }),
  );

  const retryAllFailedBackupsMutation = useMutation(
    trpc.dashboard.admin.retryAllFailedBackups.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    }),
  );

  const isBackfillRunning = status.backfillStatus?.status === 'running';
  const isCleanupRunning = status.cleanupStatus?.status === 'running';
  const isBackupRunning = status.bulkBackupStatus?.status === 'running';
  const isSizesRunning = status.backfillSizesStatus?.status === 'running';

  // Format bytes to human readable
  const formatBytes = (bytes: string | number) => {
    const num = typeof bytes === 'string' ? Number.parseInt(bytes, 10) : bytes;
    if (num === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return `${Number.parseFloat((num / k ** i).toFixed(2))} ${sizes[i]}`;
  };

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
                Total Storage
              </Text>
              <Text size="xl" fw={700}>
                {formatBytes(status.stats.totalStorageBytes)}
              </Text>
              {status.stats.nullSizeBytesCount > 0 && (
                <Text size="xs" c="orange">
                  {status.stats.nullSizeBytesCount} missing sizes
                </Text>
              )}
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

      {/* Cleanup Stale Upload States Section */}
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3}>
              <Group gap="xs">
                <IconTrash size={20} />
                Cleanup Stale Upload States
              </Group>
            </Title>
            {getStatusBadge(status.cleanupStatus)}
          </Group>

          <Text size="sm" c="dimmed">
            Delete UploadState records that are not backed up and older than a
            specified threshold. This helps remove tracking records for uploads
            that no longer exist or were never completed.
          </Text>

          {isCleanupRunning && status.cleanupStatus ? (
            <>
              <Group grow>
                <Card withBorder p="sm">
                  <Text size="xs" c="dimmed">
                    Deleted
                  </Text>
                  <Text fw={600}>
                    {status.cleanupStatus.totalDeleted?.toLocaleString() ?? 0}
                  </Text>
                </Card>
                <Card withBorder p="sm">
                  <Text size="xs" c="dimmed">
                    Remaining
                  </Text>
                  <Text fw={600}>
                    {status.cleanupStatus.remaining?.toLocaleString() ?? 0}
                  </Text>
                </Card>
                <Card withBorder p="sm">
                  <Text size="xs" c="dimmed">
                    Batches
                  </Text>
                  <Text fw={600}>
                    {status.cleanupStatus.batchesCompleted?.toLocaleString() ??
                      0}
                  </Text>
                </Card>
              </Group>

              <Button
                color="red"
                leftSection={<IconPlayerPause size={16} />}
                onClick={() => cancelCleanupMutation.mutate()}
                loading={cancelCleanupMutation.isPending}
              >
                Cancel Cleanup
              </Button>
            </>
          ) : (
            <>
              <Group grow>
                <NumberInput
                  label="Batch Size"
                  description="Records per batch"
                  value={cleanupBatchSize}
                  onChange={setCleanupBatchSize}
                  min={1}
                  max={1000}
                  size="sm"
                />
                <NumberInput
                  label="Delay (ms)"
                  description="Between batches"
                  value={cleanupDelayMs}
                  onChange={setCleanupDelayMs}
                  min={0}
                  max={10000}
                  size="sm"
                />
                <NumberInput
                  label="Older Than (days)"
                  description="Delete records older than"
                  value={cleanupOlderThanDays}
                  onChange={setCleanupOlderThanDays}
                  min={1}
                  max={365}
                  size="sm"
                />
                <NumberInput
                  label="Max Rows"
                  description="Leave empty for all"
                  value={cleanupMaxRows}
                  onChange={setCleanupMaxRows}
                  min={1}
                  placeholder="All"
                  size="sm"
                />
              </Group>

              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Warning"
                color="yellow"
              >
                This will permanently delete UploadState records that are NOT
                backed up and older than the specified threshold. Make sure to
                back up any uploads you want to keep before running this
                cleanup.
              </Alert>

              <Button
                leftSection={<IconTrash size={16} />}
                color="red"
                onClick={() =>
                  startCleanupMutation.mutate({
                    batchSize: Number(cleanupBatchSize),
                    delayBetweenBatchesMs: Number(cleanupDelayMs),
                    olderThanDays: Number(cleanupOlderThanDays),
                    maxRows:
                      cleanupMaxRows === ''
                        ? undefined
                        : Number(cleanupMaxRows),
                  })
                }
                loading={startCleanupMutation.isPending}
              >
                Start Cleanup
              </Button>

              {startCleanupMutation.error && (
                <Alert color="red" title="Error">
                  {startCleanupMutation.error.message}
                </Alert>
              )}
            </>
          )}
        </Stack>
      </Card>

      {/* Backfill File Sizes Section */}
      {status.stats.nullSizeBytesCount > 0 && (
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={3}>
                <Group gap="xs">
                  <IconFileInfo size={20} />
                  Backfill File Sizes
                </Group>
              </Title>
              {getStatusBadge(status.backfillSizesStatus)}
            </Group>

            <Text size="sm" c="dimmed">
              Populate missing file sizes for UploadState records by querying
              the ingest S3 bucket. This is needed for accurate storage
              statistics.
            </Text>

            {isSizesRunning && status.backfillSizesStatus ? (
              <>
                <Group grow>
                  <Card withBorder p="sm">
                    <Text size="xs" c="dimmed">
                      Updated
                    </Text>
                    <Text fw={600}>
                      {status.backfillSizesStatus.totalUpdated?.toLocaleString() ??
                        0}
                    </Text>
                  </Card>
                  <Card withBorder p="sm">
                    <Text size="xs" c="dimmed">
                      Skipped
                    </Text>
                    <Text fw={600}>
                      {status.backfillSizesStatus.totalSkipped?.toLocaleString() ??
                        0}
                    </Text>
                  </Card>
                  <Card withBorder p="sm">
                    <Text size="xs" c="dimmed">
                      Remaining
                    </Text>
                    <Text fw={600}>
                      {status.backfillSizesStatus.remaining?.toLocaleString() ??
                        0}
                    </Text>
                  </Card>
                  <Card withBorder p="sm">
                    <Text size="xs" c="dimmed">
                      Batches
                    </Text>
                    <Text fw={600}>
                      {status.backfillSizesStatus.batchesCompleted?.toLocaleString() ??
                        0}
                    </Text>
                  </Card>
                </Group>

                <Button
                  color="red"
                  leftSection={<IconPlayerPause size={16} />}
                  onClick={() => cancelSizesMutation.mutate()}
                  loading={cancelSizesMutation.isPending}
                >
                  Cancel Backfill Sizes
                </Button>
              </>
            ) : (
              <>
                <Alert
                  icon={<IconAlertCircle size={16} />}
                  title="Missing Sizes"
                  color="orange"
                >
                  {status.stats.nullSizeBytesCount.toLocaleString()} upload
                  states are missing file size information.
                </Alert>

                <Group grow>
                  <NumberInput
                    label="Batch Size"
                    description="Records per batch"
                    value={sizesBatchSize}
                    onChange={setSizesBatchSize}
                    min={1}
                    max={1000}
                    size="sm"
                  />
                  <NumberInput
                    label="Delay (ms)"
                    description="Between batches"
                    value={sizesDelayMs}
                    onChange={setSizesDelayMs}
                    min={0}
                    max={10000}
                    size="sm"
                  />
                  <NumberInput
                    label="Max Rows"
                    description="Leave empty for all"
                    value={sizesMaxRows}
                    onChange={setSizesMaxRows}
                    min={1}
                    placeholder="All"
                    size="sm"
                  />
                </Group>

                <Button
                  leftSection={<IconPlayerPlay size={16} />}
                  onClick={() =>
                    startSizesMutation.mutate({
                      batchSize: Number(sizesBatchSize),
                      delayBetweenBatchesMs: Number(sizesDelayMs),
                      maxRows:
                        sizesMaxRows === '' ? undefined : Number(sizesMaxRows),
                    })
                  }
                  loading={startSizesMutation.isPending}
                >
                  Start Backfill Sizes
                </Button>

                {startSizesMutation.error && (
                  <Alert color="red" title="Error">
                    {startSizesMutation.error.message}
                  </Alert>
                )}
              </>
            )}
          </Stack>
        </Card>
      )}

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

            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Failed Backups"
              color="red"
            >
              These backups failed during processing. You can retry individual
              backups or reset all failed backups to try again.
            </Alert>

            <Group>
              <Button
                leftSection={<IconRefresh size={16} />}
                onClick={() => retryAllFailedBackupsMutation.mutate()}
                loading={retryAllFailedBackupsMutation.isPending}
                color="blue"
              >
                Retry All Failed Backups
              </Button>
            </Group>

            {retryAllFailedBackupsMutation.isSuccess && (
              <Alert color="green" title="Success">
                Successfully reset {retryAllFailedBackupsMutation.data.count}{' '}
                failed backup
                {retryAllFailedBackupsMutation.data.count === 1 ? '' : 's'} to
                retry. Start the bulk backup to process them.
              </Alert>
            )}

            {retryAllFailedBackupsMutation.error && (
              <Alert color="red" title="Error">
                {retryAllFailedBackupsMutation.error.message}
              </Alert>
            )}

            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>S3 Key</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>Upload</Table.Th>
                  <Table.Th>Failed At</Table.Th>
                  <Table.Th>Actions</Table.Th>
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
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconRefresh size={14} />}
                        onClick={() =>
                          retryFailedBackupMutation.mutate({
                            uploadStateId: backup.id,
                          })
                        }
                        loading={retryFailedBackupMutation.isPending}
                      >
                        Retry
                      </Button>
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
