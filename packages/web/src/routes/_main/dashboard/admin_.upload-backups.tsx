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

import {
  Alert,
  Badge,
  Button,
  Progress,
  Table,
  Text,
  TextInput,
  Title,
} from '@/components/ui';
import { useTRPC } from '@/trpc/react';

function ProgressBar({
  value,
  color,
  className,
}: {
  value: number;
  color?: 'green';
  className?: string;
}) {
  return (
    <Progress value={value} color={color} animated className={className} />
  );
}

// Numeric field replacing Mantine's NumberInput. Keeps the `number | string`
// value contract the callers use (empty string clears the bound).
function NumberField({
  label,
  description,
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  label: string;
  description?: string;
  value: number | string;
  onChange: (value: number | string) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <TextInput
      type="number"
      label={label}
      description={description}
      placeholder={placeholder}
      value={String(value)}
      onChange={(e) => {
        const v = e.currentTarget.value;
        onChange(v === '' ? '' : Number(v));
      }}
      min={min}
      max={max}
    />
  );
}

export const Route = createFileRoute('/_main/dashboard/admin_/upload-backups')({
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title order={1}>Upload Backups</Title>
          <Text c="dimmed">
            Manage Glacier Deep Archive backups for uploaded files
          </Text>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="border-fancy-pants overflow-hidden rounded-xl bg-white dark:bg-zinc-900">
        <div className="flex flex-col gap-4">
          <Title order={3}>Backup Statistics</Title>

          <div className="flex flex-nowrap items-center justify-start gap-4 [&>*]:flex-1">
            <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-4 dark:bg-zinc-900">
              <Text size="sm" c="dimmed">
                Total Tracked
              </Text>
              <Text size="xl" fw={700}>
                {status.stats.total.toLocaleString()}
              </Text>
            </div>
            <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-4 dark:bg-zinc-900">
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
            </div>
            <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-4 dark:bg-zinc-900">
              <Text size="sm" c="dimmed">
                Not Backed Up
              </Text>
              <Text size="xl" fw={700} c="orange">
                {status.stats.notBackedUp.toLocaleString()}
              </Text>
            </div>
            <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-4 dark:bg-zinc-900">
              <Text size="sm" c="dimmed">
                Backed Up
              </Text>
              <Text size="xl" fw={700} c="green">
                {status.stats.backedUp.toLocaleString()}
              </Text>
            </div>
            <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-4 dark:bg-zinc-900">
              <Text size="sm" c="dimmed">
                Failed
              </Text>
              <Text size="xl" fw={700} c="red">
                {status.stats.backupFailed.toLocaleString()}
              </Text>
            </div>
          </div>

          {status.stats.total > 0 && (
            <div>
              <Text size="sm" className="mb-2.5">
                Backup Progress
              </Text>
              <ProgressBar
                value={(status.stats.backedUp / status.stats.total) * 100}
                className="h-4"
                color="green"
              />
              <Text size="sm" c="dimmed" className="mt-2.5">
                {((status.stats.backedUp / status.stats.total) * 100).toFixed(
                  1,
                )}
                % backed up
              </Text>
            </div>
          )}
        </div>
      </div>

      {/* Backfill Section */}
      <div className="border-fancy-pants overflow-hidden rounded-xl bg-white dark:bg-zinc-900">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Title order={3}>
              <div className="flex flex-wrap items-center justify-start gap-2.5">
                <IconDatabase size={20} />
                Backfill Upload States
              </div>
            </Title>
            {getStatusBadge(status.backfillStatus)}
          </div>

          <Text size="sm" c="dimmed">
            Create UploadState records for existing uploads in the database that
            are not yet tracked. These will be marked as "not backed up".
          </Text>

          {isBackfillRunning && status.backfillStatus ? (
            <>
              <div className="flex flex-nowrap items-center justify-start gap-4 [&>*]:flex-1">
                <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                  <Text size="xs" c="dimmed">
                    Created
                  </Text>
                  <Text fw={600}>
                    {status.backfillStatus.totalCreated?.toLocaleString() ?? 0}
                  </Text>
                </div>
                <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                  <Text size="xs" c="dimmed">
                    Remaining
                  </Text>
                  <Text fw={600}>
                    {status.backfillStatus.remaining?.toLocaleString() ?? 0}
                  </Text>
                </div>
                <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                  <Text size="xs" c="dimmed">
                    Batches
                  </Text>
                  <Text fw={600}>
                    {status.backfillStatus.batchesCompleted?.toLocaleString() ??
                      0}
                  </Text>
                </div>
              </div>

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
              <div className="flex flex-nowrap items-center justify-start gap-4 [&>*]:flex-1">
                <NumberField
                  label="Batch Size"
                  description="Records per batch"
                  value={backfillBatchSize}
                  onChange={setBackfillBatchSize}
                  min={1}
                  max={1000}
                />
                <NumberField
                  label="Delay (ms)"
                  description="Between batches"
                  value={backfillDelayMs}
                  onChange={setBackfillDelayMs}
                  min={0}
                  max={10000}
                />
                <NumberField
                  label="Max Rows"
                  description="Leave empty for all"
                  value={backfillMaxRows}
                  onChange={setBackfillMaxRows}
                  min={1}
                  placeholder="All"
                />
              </div>

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
        </div>
      </div>

      {/* Cleanup Stale Upload States Section */}
      <div className="border-fancy-pants overflow-hidden rounded-xl bg-white dark:bg-zinc-900">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Title order={3}>
              <div className="flex flex-wrap items-center justify-start gap-2.5">
                <IconTrash size={20} />
                Cleanup Stale Upload States
              </div>
            </Title>
            {getStatusBadge(status.cleanupStatus)}
          </div>

          <Text size="sm" c="dimmed">
            Delete UploadState records that are not backed up and older than a
            specified threshold. This helps remove tracking records for uploads
            that no longer exist or were never completed.
          </Text>

          {isCleanupRunning && status.cleanupStatus ? (
            <>
              <div className="flex flex-nowrap items-center justify-start gap-4 [&>*]:flex-1">
                <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                  <Text size="xs" c="dimmed">
                    Deleted
                  </Text>
                  <Text fw={600}>
                    {status.cleanupStatus.totalDeleted?.toLocaleString() ?? 0}
                  </Text>
                </div>
                <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                  <Text size="xs" c="dimmed">
                    Remaining
                  </Text>
                  <Text fw={600}>
                    {status.cleanupStatus.remaining?.toLocaleString() ?? 0}
                  </Text>
                </div>
                <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                  <Text size="xs" c="dimmed">
                    Batches
                  </Text>
                  <Text fw={600}>
                    {status.cleanupStatus.batchesCompleted?.toLocaleString() ??
                      0}
                  </Text>
                </div>
              </div>

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
              <div className="flex flex-nowrap items-center justify-start gap-4 [&>*]:flex-1">
                <NumberField
                  label="Batch Size"
                  description="Records per batch"
                  value={cleanupBatchSize}
                  onChange={setCleanupBatchSize}
                  min={1}
                  max={1000}
                />
                <NumberField
                  label="Delay (ms)"
                  description="Between batches"
                  value={cleanupDelayMs}
                  onChange={setCleanupDelayMs}
                  min={0}
                  max={10000}
                />
                <NumberField
                  label="Older Than (days)"
                  description="Delete records older than"
                  value={cleanupOlderThanDays}
                  onChange={setCleanupOlderThanDays}
                  min={1}
                  max={365}
                />
                <NumberField
                  label="Max Rows"
                  description="Leave empty for all"
                  value={cleanupMaxRows}
                  onChange={setCleanupMaxRows}
                  min={1}
                  placeholder="All"
                />
              </div>

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
        </div>
      </div>

      {/* Backfill File Sizes Section */}
      {status.stats.nullSizeBytesCount > 0 && (
        <div className="border-fancy-pants overflow-hidden rounded-xl bg-white dark:bg-zinc-900">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Title order={3}>
                <div className="flex flex-wrap items-center justify-start gap-2.5">
                  <IconFileInfo size={20} />
                  Backfill File Sizes
                </div>
              </Title>
              {getStatusBadge(status.backfillSizesStatus)}
            </div>

            <Text size="sm" c="dimmed">
              Populate missing file sizes for UploadState records by querying
              the ingest S3 bucket. This is needed for accurate storage
              statistics.
            </Text>

            {isSizesRunning && status.backfillSizesStatus ? (
              <>
                <div className="flex flex-nowrap items-center justify-start gap-4 [&>*]:flex-1">
                  <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                    <Text size="xs" c="dimmed">
                      Updated
                    </Text>
                    <Text fw={600}>
                      {status.backfillSizesStatus.totalUpdated?.toLocaleString() ??
                        0}
                    </Text>
                  </div>
                  <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                    <Text size="xs" c="dimmed">
                      Skipped
                    </Text>
                    <Text fw={600}>
                      {status.backfillSizesStatus.totalSkipped?.toLocaleString() ??
                        0}
                    </Text>
                  </div>
                  <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                    <Text size="xs" c="dimmed">
                      Remaining
                    </Text>
                    <Text fw={600}>
                      {status.backfillSizesStatus.remaining?.toLocaleString() ??
                        0}
                    </Text>
                  </div>
                  <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                    <Text size="xs" c="dimmed">
                      Batches
                    </Text>
                    <Text fw={600}>
                      {status.backfillSizesStatus.batchesCompleted?.toLocaleString() ??
                        0}
                    </Text>
                  </div>
                </div>

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

                <div className="flex flex-nowrap items-center justify-start gap-4 [&>*]:flex-1">
                  <NumberField
                    label="Batch Size"
                    description="Records per batch"
                    value={sizesBatchSize}
                    onChange={setSizesBatchSize}
                    min={1}
                    max={1000}
                  />
                  <NumberField
                    label="Delay (ms)"
                    description="Between batches"
                    value={sizesDelayMs}
                    onChange={setSizesDelayMs}
                    min={0}
                    max={10000}
                  />
                  <NumberField
                    label="Max Rows"
                    description="Leave empty for all"
                    value={sizesMaxRows}
                    onChange={setSizesMaxRows}
                    min={1}
                    placeholder="All"
                  />
                </div>

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
          </div>
        </div>
      )}

      {/* Bulk Backup Section */}
      <div className="border-fancy-pants overflow-hidden rounded-xl bg-white dark:bg-zinc-900">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Title order={3}>
              <div className="flex flex-wrap items-center justify-start gap-2.5">
                <IconArchive size={20} />
                Bulk Backup to Glacier
              </div>
            </Title>
            {getStatusBadge(status.bulkBackupStatus)}
          </div>

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
              <div className="flex flex-nowrap items-center justify-start gap-4 [&>*]:flex-1">
                <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                  <Text size="xs" c="dimmed">
                    Jobs Started
                  </Text>
                  <Text fw={600}>
                    {status.bulkBackupStatus.totalStarted?.toLocaleString() ??
                      0}
                  </Text>
                </div>
                <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                  <Text size="xs" c="dimmed">
                    Remaining
                  </Text>
                  <Text fw={600}>
                    {status.bulkBackupStatus.remaining?.toLocaleString() ?? 0}
                  </Text>
                </div>
                <div className="border-fancy-pants overflow-hidden rounded-xl bg-white p-3 dark:bg-zinc-900">
                  <Text size="xs" c="dimmed">
                    Batches
                  </Text>
                  <Text fw={600}>
                    {status.bulkBackupStatus.batchesCompleted?.toLocaleString() ??
                      0}
                  </Text>
                </div>
              </div>

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

              <div className="flex flex-nowrap items-center justify-start gap-4 [&>*]:flex-1">
                <NumberField
                  label="Batch Size"
                  description="Jobs per batch"
                  value={backupBatchSize}
                  onChange={setBackupBatchSize}
                  min={1}
                  max={100}
                />
                <NumberField
                  label="Delay (ms)"
                  description="Between batches"
                  value={backupDelayMs}
                  onChange={setBackupDelayMs}
                  min={0}
                  max={60000}
                />
                <NumberField
                  label="Max Uploads"
                  description="Leave empty for all"
                  value={backupMaxUploads}
                  onChange={setBackupMaxUploads}
                  min={1}
                  placeholder="All"
                />
              </div>

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
        </div>
      </div>

      {/* Failed Backups Section */}
      {failedBackups.totalCount > 0 && (
        <div className="border-fancy-pants overflow-hidden rounded-xl bg-white dark:bg-zinc-900">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Title order={3}>
                <div className="flex flex-wrap items-center justify-start gap-2.5">
                  <IconX size={20} />
                  Failed Backups
                </div>
              </Title>
              <Badge color="red">{failedBackups.totalCount} total</Badge>
            </div>

            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Failed Backups"
              color="red"
            >
              These backups failed during processing. You can retry individual
              backups or reset all failed backups to try again.
            </Alert>

            <div className="flex flex-wrap items-center justify-start gap-4">
              <Button
                leftSection={<IconRefresh size={16} />}
                onClick={() => retryAllFailedBackupsMutation.mutate()}
                loading={retryAllFailedBackupsMutation.isPending}
                color="blue"
              >
                Retry All Failed Backups
              </Button>
            </div>

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
          </div>
        </div>
      )}
    </div>
  );
}
