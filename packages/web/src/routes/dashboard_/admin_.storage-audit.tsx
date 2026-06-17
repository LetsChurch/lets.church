import {
  Anchor,
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
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute('/dashboard_/admin_/storage-audit')({
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

  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>Storage Audit</Title>
        <Text c="dimmed">
          Reconcile every S3 bucket against the database: find orphaned files
          (extra objects we no longer expect), missing files, and broken HLS
          streams. Read-only — nothing is deleted. The full report is emailed to
          you and saved for download.
        </Text>
      </div>

      <Group>
        <Button
          loading={startMutation.isPending}
          disabled={isRunning}
          onClick={() => startMutation.mutate(undefined)}
        >
          {isRunning ? 'Audit in progress…' : 'Run storage audit'}
        </Button>
      </Group>

      <Stack gap="md">
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
            <Card key={run.id} withBorder>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Group gap="xs">
                    {statusBadge(run.status)}
                    <Text size="sm" c="dimmed">
                      {new Date(run.startedAt).toLocaleString()}
                    </Text>
                  </Group>
                  {run.reportUrl ? (
                    <Anchor href={run.reportUrl} size="sm">
                      Download full report
                    </Anchor>
                  ) : null}
                </Group>

                {run.liveProgress ? (
                  <div>
                    <Group justify="space-between" mb={4}>
                      <Text size="xs" c="dimmed">
                        {run.liveProgress.phase} —{' '}
                        {run.liveProgress.shardsComplete} /{' '}
                        {run.liveProgress.totalShards} shards
                      </Text>
                      <Text size="xs" c="dimmed">
                        {run.liveProgress.orphans.toLocaleString()} orphans,{' '}
                        {run.liveProgress.missing.toLocaleString()} missing
                      </Text>
                    </Group>
                    <Progress value={progressPercent} animated size="sm" />
                  </div>
                ) : null}

                {run.status === 'FAILED' && run.error ? (
                  <Text size="sm" c="red">
                    {run.error}
                  </Text>
                ) : null}

                {totals ? (
                  <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="md">
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
                  </SimpleGrid>
                ) : null}
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </Stack>
  );
}
