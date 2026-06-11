import {
  Badge,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Text,
  Title,
} from '@mantine/core';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/dashboard_/admin')({
  component: AdminPage,
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
    await Promise.all([
      queryClient.ensureQueryData(
        trpc.dashboard.admin.getPendingApprovals.queryOptions(),
      ),
      queryClient.ensureQueryData(
        trpc.dashboard.admin.getUploadBackupStats.queryOptions(),
      ),
      queryClient.ensureQueryData(
        trpc.dashboard.admin.getBackfillFilenamesStatus.queryOptions(),
      ),
    ]);
    return {
      backNavigation: {
        label: 'Dashboard',
        to: '/dashboard',
      },
    };
  },
});

// Format a duration in seconds into a compact human string (e.g. "~3m", "~2h 5m").
function formatDuration(seconds: number): string {
  if (seconds < 60) return '<1m';
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

function AdminPage() {
  const trpc = useTRPC();

  const { data: pendingApprovals } = useSuspenseQuery(
    trpc.dashboard.admin.getPendingApprovals.queryOptions(),
  );

  const { data: backupStats } = useSuspenseQuery(
    trpc.dashboard.admin.getUploadBackupStats.queryOptions(),
  );

  const { data: backfillStatus } = useSuspenseQuery(
    trpc.dashboard.admin.getBackfillFilenamesStatus.queryOptions(),
  );

  // Async-load Temporal queue stats (kept out of the loader so the page renders
  // immediately; refetched periodically so the numbers stay live).
  const { data: queueStats, isLoading: isLoadingQueueStats } = useQuery({
    ...trpc.dashboard.admin.getQueueStats.queryOptions(),
    refetchInterval: 15_000,
  });

  // Number of workflows actively executing right now (in-progress work).
  const { data: runningWorkflowCount } = useQuery({
    ...trpc.dashboard.admin.getRunningWorkflowCount.queryOptions(),
    refetchInterval: 15_000,
  });

  // Lazy-load counts that require workflow status checks
  const { data: processingUploadsCount, isLoading: isLoadingProcessing } =
    useQuery(trpc.dashboard.admin.getProcessingUploadsCount.queryOptions());

  const { data: failedUploadsCount, isLoading: isLoadingFailed } = useQuery(
    trpc.dashboard.admin.getFailedUploadsCount.queryOptions(),
  );

  const {
    data: failedAnnotationsCount,
    isLoading: isLoadingFailedAnnotations,
  } = useQuery(trpc.dashboard.admin.getFailedAnnotationsCount.queryOptions());

  const { data: failedSummariesCount, isLoading: isLoadingFailedSummaries } =
    useQuery(trpc.dashboard.admin.getFailedSummariesCount.queryOptions());

  const { data: deletingUploadsCount, isLoading: isLoadingDeleting } = useQuery(
    trpc.dashboard.admin.getDeletingUploadsCount.queryOptions(),
  );

  const { data: maintenance } = useQuery(
    trpc.dashboard.admin.getMaintenanceSettings.queryOptions(),
  );

  return (
    <>
      <Title order={1} mb="lg">
        Admin
      </Title>

      <Group mb="sm" gap="sm">
        <Title order={2} size="h4">
          Queues
        </Title>
        {runningWorkflowCount != null ? (
          <Badge color={runningWorkflowCount > 0 ? 'blue' : 'gray'} size="sm">
            {runningWorkflowCount > 0
              ? `${runningWorkflowCount.toLocaleString()} running`
              : 'None running'}
          </Badge>
        ) : null}
      </Group>
      {isLoadingQueueStats ? (
        <Group mb="xl" gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Loading queue stats…
          </Text>
        </Group>
      ) : queueStats && queueStats.length > 0 ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mb="xl">
          {queueStats.map((queue) => (
            <Card
              key={queue.name}
              shadow="xs"
              padding="lg"
              radius="md"
              withBorder
            >
              <Group justify="space-between" mb="xs">
                <Text fw={500}>{queue.label}</Text>
                <Badge
                  color={queue.backlogCount > 0 ? 'yellow' : 'green'}
                  size="sm"
                >
                  {queue.backlogCount > 0
                    ? `${queue.backlogCount.toLocaleString()} queued`
                    : 'Idle'}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {queue.backlogCount > 0
                  ? queue.etaSeconds != null
                    ? `ETA ~${formatDuration(queue.etaSeconds)} to clear`
                    : queue.backlogAgeSeconds != null
                      ? `Oldest task waiting ${formatDuration(queue.backlogAgeSeconds)}`
                      : 'ETA unavailable'
                  : 'No backlogged tasks'}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <Text size="sm" c="dimmed" mb="xl">
          Queue stats unavailable.
        </Text>
      )}

      <Title order={2} size="h4" mb="sm">
        Content
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mb="xl">
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/speaker-queue"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Speaker Labeling</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Match unlabeled voices to existing speakers, or name unknown ones,
            across all channels
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/speakers"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Speakers</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Every named speaker across all channels
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/featured"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Featured Media</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Manage featured uploads on homepage carousel
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/channels"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Channels</Text>
            {pendingApprovals.channels.length > 0 ? (
              <Badge color="orange" size="sm">
                {pendingApprovals.channels.length} pending
              </Badge>
            ) : null}
          </Group>
          <Text size="sm" c="dimmed">
            Manage all channels and approvals
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/organizations"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Organizations</Text>
            {pendingApprovals.organizations.length > 0 ? (
              <Badge color="orange" size="sm">
                {pendingApprovals.organizations.length} pending
              </Badge>
            ) : null}
          </Group>
          <Text size="sm" c="dimmed">
            Manage churches, ministries, and geocoding
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/organization-tags"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Organization Tags</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Manage tags for categorizing organizations
          </Text>
        </Card>
      </SimpleGrid>

      <Title order={2} size="h4" mb="sm">
        Users
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mb="xl">
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/users"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Users</Text>
            <Badge color="blue" size="sm">
              {pendingApprovals.userCount}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Manage user accounts and roles
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/newsletter-lists"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Newsletter Lists</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Configure mailing list subscriptions
          </Text>
        </Card>
      </SimpleGrid>

      <Title order={2} size="h4" mb="sm">
        Uploads
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mb="xl">
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/import-sources"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Import Sources</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Manage automated media import sources
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/processing-uploads"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Processing Uploads</Text>
            {isLoadingProcessing ? (
              <Loader size="xs" />
            ) : (
              <Badge color="yellow" size="sm">
                {processingUploadsCount ?? 0}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            Monitor uploads currently being processed
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/duplicate-uploads"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Duplicate Uploads</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Find and delete duplicate imported uploads
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/failed-uploads"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Failed Uploads</Text>
            {isLoadingFailed ? (
              <Loader size="xs" />
            ) : (
              <Badge
                color={failedUploadsCount === 0 ? 'green' : 'red'}
                size="sm"
              >
                {failedUploadsCount === 0 ? 'None' : failedUploadsCount}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            Retry uploads that failed to process
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/deleting-uploads"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Deleting Uploads</Text>
            {isLoadingDeleting ? (
              <Loader size="xs" />
            ) : (
              <Badge
                color={deletingUploadsCount === 0 ? 'green' : 'orange'}
                size="sm"
              >
                {deletingUploadsCount === 0 ? 'None' : deletingUploadsCount}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            Monitor uploads currently being deleted
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/upload-backups"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Upload Backups</Text>
            <Badge
              color={
                backupStats.stats.notBackedUp === 0
                  ? 'green'
                  : backupStats.stats.backupFailed > 0
                    ? 'red'
                    : 'orange'
              }
              size="sm"
            >
              {backupStats.stats.notBackedUp === 0
                ? 'Done'
                : backupStats.stats.notBackedUp.toLocaleString()}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Manage S3 backups for uploaded media
          </Text>
        </Card>
      </SimpleGrid>

      <Title order={2} size="h4" mb="sm">
        AI
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mb="xl">
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/llm-eval"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>LLM Eval</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Run summarize/annotate prompts against arbitrary OpenRouter models
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/failed-annotations"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Failed Annotations</Text>
            {isLoadingFailedAnnotations ? (
              <Loader size="xs" />
            ) : (
              <Badge
                color={failedAnnotationsCount === 0 ? 'green' : 'red'}
                size="sm"
              >
                {failedAnnotationsCount === 0 ? 'None' : failedAnnotationsCount}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            Uploads where both primary and fallback annotate models failed
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/failed-summaries"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Failed Summaries</Text>
            {isLoadingFailedSummaries ? (
              <Loader size="xs" />
            ) : (
              <Badge
                color={failedSummariesCount === 0 ? 'green' : 'red'}
                size="sm"
              >
                {failedSummariesCount === 0 ? 'None' : failedSummariesCount}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            Uploads where both primary and fallback summarize models failed
          </Text>
        </Card>
      </SimpleGrid>

      <Title order={2} size="h4" mb="sm">
        System
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/backfill-filenames"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Backfill Filenames</Text>
            {backfillStatus?.workflowStatus?.status === 'running' ? (
              <Badge color="blue">Running</Badge>
            ) : null}
          </Group>
          <Text size="sm" c="dimmed">
            Detect file extensions for existing uploads
          </Text>
          {backfillStatus && backfillStatus.remainingCount > 0 ? (
            <Text size="xs" c="dimmed" mt="xs">
              {backfillStatus.remainingCount.toLocaleString()} uploads to
              process
            </Text>
          ) : null}
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/searches"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Search Logs</Text>
          </Group>
          <Text size="sm" c="dimmed">
            View search queries and analytics
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/reindex"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Reindex</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Rebuild Elasticsearch indices from the database
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/reprocess"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Reprocess Media</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Re-transcode uploads through the current pipeline
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/storage-audit"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Storage Audit</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Reconcile S3 buckets against the database for orphaned or missing
            files
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/maintenance"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Maintenance Mode</Text>
            {maintenance?.maintenanceMode ? (
              <Badge color="orange" size="sm">
                On
              </Badge>
            ) : null}
          </Group>
          <Text size="sm" c="dimmed">
            Restrict the site to admins only
          </Text>
        </Card>
      </SimpleGrid>
    </>
  );
}
