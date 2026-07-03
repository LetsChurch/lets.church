import { IconTrash } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Progress,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { modals } from '@/components/ui/confirm-modal';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/dashboard/admin_/storage-audit')({
  component: StorageAuditPage,
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
      trpc.dashboard.admin.getStorageAuditStatus.queryOptions(),
    );
    return {
      backNavigation: { label: 'Admin', to: '/dashboard/admin' },
    };
  },
});

function statusBadge(status: string) {
  switch (status) {
    case 'RUNNING':
      return <Badge color="blue">Running</Badge>;
    case 'COMPLETED':
      return <Badge color="green">Completed</Badge>;
    case 'FAILED':
      return <Badge color="red">Failed</Badge>;
    default:
      return <Badge color="gray">{status}</Badge>;
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <Text size="xl" fw={700} c={value > 0 ? 'orange' : undefined}>
        {value.toLocaleString()}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </div>
  );
}

function StorageAuditPage() {
  const trpc = useTRPC();

  const { data: runs, refetch } = useSuspenseQuery({
    ...trpc.dashboard.admin.getStorageAuditStatus.queryOptions(),
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === 'RUNNING') ? 3000 : false,
  });

  const isRunning = runs.some((r) => r.status === 'RUNNING');

  const startMutation = useMutation(
    trpc.dashboard.admin.startStorageAudit.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Storage audit started' });
        refetch();
      },
      onError: (err) => {
        showFailure({
          message:
            err instanceof Error
              ? err.message
              : 'Failed to start storage audit',
        });
      },
    }),
  );

  const deleteMutation = useMutation(
    trpc.dashboard.admin.deleteStorageAudit.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Storage audit deleted' });
        refetch();
      },
      onError: (err) => {
        showFailure({
          message:
            err instanceof Error
              ? err.message
              : 'Failed to delete storage audit',
        });
      },
    }),
  );

  const confirmDelete = (auditId: string, startedAt: Date | string) => {
    modals.openConfirmModal({
      title: 'Delete storage audit',
      children: (
        <Text size="sm">
          Delete the audit from{' '}
          <strong>{new Date(startedAt).toLocaleString()}</strong>? This removes
          the run and its report files from storage. This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteMutation.mutate({ auditId }),
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Title order={1}>Storage Audit</Title>
        <Text c="dimmed">
          Reconcile every S3 bucket against the database: find orphaned files
          (extra objects we no longer expect), missing files, and broken HLS
          streams. Read-only — nothing is deleted. The full report is emailed to
          you and saved for download.
        </Text>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button
          loading={startMutation.isPending}
          disabled={isRunning}
          onClick={() => startMutation.mutate(undefined)}
        >
          {isRunning ? 'Audit in progress…' : 'Run storage audit'}
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {runs.length === 0 ? (
          <Text c="dimmed">No audits have been run yet.</Text>
        ) : null}

        {runs.map((run) => {
          const progressPercent =
            run.liveProgress && run.liveProgress.totalShards > 0
              ? Math.round(
                  (run.liveProgress.shardsComplete /
                    run.liveProgress.totalShards) *
                    100,
                )
              : 0;
          const totals = run.summary?.totals;

          return (
            <div
              key={run.id}
              className="overflow-hidden rounded-xl border-fancy-pants bg-white p-4 dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center justify-start gap-2.5">
                    {statusBadge(run.status)}
                    <Text size="sm" c="dimmed">
                      {new Date(run.startedAt).toLocaleString()}
                    </Text>
                  </div>
                  <div className="flex flex-wrap items-center justify-start gap-2.5">
                    {run.reportUrl ? (
                      <Anchor href={run.reportUrl} size="sm">
                        Download full report
                      </Anchor>
                    ) : null}
                    <Tooltip
                      label={
                        run.status === 'RUNNING'
                          ? 'Cannot delete a running audit'
                          : 'Delete audit'
                      }
                    >
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Delete audit"
                        disabled={run.status === 'RUNNING'}
                        loading={
                          deleteMutation.isPending &&
                          deleteMutation.variables?.auditId === run.id
                        }
                        onClick={() => confirmDelete(run.id, run.startedAt)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </div>
                </div>

                {run.liveProgress ? (
                  <div>
                    <div className="mb-[4px] flex flex-wrap items-center justify-between gap-4">
                      <Text size="xs" c="dimmed">
                        {run.liveProgress.phase} —{' '}
                        {run.liveProgress.shardsComplete} /{' '}
                        {run.liveProgress.totalShards} shards
                      </Text>
                      <Text size="xs" c="dimmed">
                        {run.liveProgress.orphans.toLocaleString()} orphans,{' '}
                        {run.liveProgress.missing.toLocaleString()} missing
                      </Text>
                    </div>
                    <Progress value={progressPercent} size="sm" animated />
                  </div>
                ) : null}

                {run.status === 'FAILED' && run.error ? (
                  <Text size="sm" c="red">
                    {run.error}
                  </Text>
                ) : null}

                {totals ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
                    <Stat
                      label="Orphan prefixes"
                      value={totals.orphanPrefixes}
                    />
                    <Stat
                      label="Orphan backups"
                      value={totals.orphanBackupKeys}
                    />
                    <Stat
                      label="Missing prefixes"
                      value={totals.missingPrefixes}
                    />
                    <Stat label="Missing keys" value={totals.missingKeys} />
                    <Stat
                      label="Missing HLS segments"
                      value={totals.missingHlsSegments}
                    />
                    <Stat label="Broken HLS" value={totals.brokenHls} />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
