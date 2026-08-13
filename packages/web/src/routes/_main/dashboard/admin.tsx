import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import { DashboardPageHeader } from '@/components/dashboard/dashboard-ui';
import { Badge, Loader, Text, Title } from '@/components/ui';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/dashboard/admin')({
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
      <DashboardPageHeader
        eyebrow="Administration"
        title="Admin"
        description="Monitor publishing queues, review exceptions, and maintain system operations."
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Title order={2} className="text-lg font-semibold">
          Queues
        </Title>
        {runningWorkflowCount != null ? (
          <Badge color={runningWorkflowCount > 0 ? 'blue' : 'gray'} size="sm">
            {runningWorkflowCount > 0
              ? `${runningWorkflowCount.toLocaleString()} running`
              : 'None running'}
          </Badge>
        ) : null}
      </div>
      {isLoadingQueueStats ? (
        <div
          className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-hidden="true"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="dashboard-panel p-5">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
                <div className="h-5 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
              </div>
              <div className="h-4 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
      ) : queueStats && queueStats.length > 0 ? (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {queueStats.map((queue) => (
            <div key={queue.name} className="dashboard-panel p-5">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
                <Text fw={500}>{queue.label}</Text>
                <Badge
                  color={queue.backlogCount > 0 ? 'yellow' : 'green'}
                  size="sm"
                >
                  {queue.backlogCount > 0
                    ? `${queue.backlogCount.toLocaleString()} queued`
                    : 'Idle'}
                </Badge>
              </div>
              <Text size="sm" c="dimmed">
                {queue.backlogCount > 0
                  ? queue.etaSeconds != null
                    ? `ETA ~${formatDuration(queue.etaSeconds)} to clear`
                    : queue.backlogAgeSeconds != null
                      ? `Oldest task waiting ${formatDuration(queue.backlogAgeSeconds)}`
                      : 'ETA unavailable'
                  : 'No backlogged tasks'}
              </Text>
            </div>
          ))}
        </div>
      ) : (
        <Text size="sm" c="dimmed" className="mb-8">
          Queue stats unavailable.
        </Text>
      )}

      <Title order={2} className="mb-3 text-lg font-semibold">
        Content
      </Title>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/dashboard/admin/speaker-queue" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Speaker Labeling</Text>
            </div>
            <Text size="sm" c="dimmed">
              Match unlabeled voices to existing speakers, or name unknown ones,
              across all channels
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/speakers" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Speakers</Text>
            </div>
            <Text size="sm" c="dimmed">
              Every named speaker across all channels
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/featured" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Featured Media</Text>
            </div>
            <Text size="sm" c="dimmed">
              Manage featured uploads on homepage carousel
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/channels" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Channels</Text>
              {pendingApprovals.channels.length > 0 ? (
                <Badge color="orange" size="sm">
                  {pendingApprovals.channels.length} pending
                </Badge>
              ) : null}
            </div>
            <Text size="sm" c="dimmed">
              Manage all channels and approvals
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/organizations" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Organizations</Text>
              {pendingApprovals.organizations.length > 0 ? (
                <Badge color="orange" size="sm">
                  {pendingApprovals.organizations.length} pending
                </Badge>
              ) : null}
            </div>
            <Text size="sm" c="dimmed">
              Manage churches, ministries, and geocoding
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/organization-tags" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Organization Tags</Text>
            </div>
            <Text size="sm" c="dimmed">
              Manage tags for categorizing organizations
            </Text>
          </div>
        </Link>
      </div>

      <Title order={2} className="mb-3 text-lg font-semibold">
        People and giving
      </Title>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/dashboard/admin/donations" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Donations</Text>
            </div>
            <Text size="sm" c="dimmed">
              Review gifts, recurring plans, refunds, and disputes
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/users" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Users</Text>
              <Badge color="blue" size="sm">
                {pendingApprovals.userCount}
              </Badge>
            </div>
            <Text size="sm" c="dimmed">
              Manage user accounts and roles
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/newsletter-lists" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Newsletter Lists</Text>
            </div>
            <Text size="sm" c="dimmed">
              Configure mailing list subscriptions
            </Text>
          </div>
        </Link>
      </div>

      <Title order={2} className="mb-3 text-lg font-semibold">
        Uploads
      </Title>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/dashboard/admin/import-sources" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Import Sources</Text>
            </div>
            <Text size="sm" c="dimmed">
              Manage automated media import sources
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/processing-uploads" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Processing Uploads</Text>
              {isLoadingProcessing ? (
                <Loader size="xs" />
              ) : (
                <Badge color="yellow" size="sm">
                  {processingUploadsCount ?? 0}
                </Badge>
              )}
            </div>
            <Text size="sm" c="dimmed">
              Monitor uploads currently being processed
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/duplicate-uploads" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Duplicate Uploads</Text>
            </div>
            <Text size="sm" c="dimmed">
              Find and delete duplicate imported uploads
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/failed-uploads" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
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
            </div>
            <Text size="sm" c="dimmed">
              Retry uploads that failed to process
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/deleting-uploads" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
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
            </div>
            <Text size="sm" c="dimmed">
              Monitor uploads currently being deleted
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/upload-backups" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
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
            </div>
            <Text size="sm" c="dimmed">
              Manage S3 backups for uploaded media
            </Text>
          </div>
        </Link>
      </div>

      <Title order={2} className="mb-3 text-lg font-semibold">
        AI
      </Title>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/dashboard/admin/llm-eval"
          search={{ task: 'annotate' }}
          className="block"
        >
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>LLM Eval</Text>
            </div>
            <Text size="sm" c="dimmed">
              Run summarize/annotate prompts against arbitrary OpenRouter models
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/failed-annotations" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Failed Annotations</Text>
              {isLoadingFailedAnnotations ? (
                <Loader size="xs" />
              ) : (
                <Badge
                  color={failedAnnotationsCount === 0 ? 'green' : 'red'}
                  size="sm"
                >
                  {failedAnnotationsCount === 0
                    ? 'None'
                    : failedAnnotationsCount}
                </Badge>
              )}
            </div>
            <Text size="sm" c="dimmed">
              Uploads where both primary and fallback annotate models failed
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/failed-summaries" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
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
            </div>
            <Text size="sm" c="dimmed">
              Uploads where both primary and fallback summarize models failed
            </Text>
          </div>
        </Link>
      </div>

      <Title order={2} className="mb-3 text-lg font-semibold">
        System
      </Title>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/dashboard/admin/backfill-filenames" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Backfill Filenames</Text>
              {backfillStatus?.workflowStatus?.status === 'running' ? (
                <Badge color="blue">Running</Badge>
              ) : null}
            </div>
            <Text size="sm" c="dimmed">
              Detect file extensions for existing uploads
            </Text>
            {backfillStatus && backfillStatus.remainingCount > 0 ? (
              <Text size="xs" c="dimmed" className="mt-2.5">
                {backfillStatus.remainingCount.toLocaleString()} uploads to
                process
              </Text>
            ) : null}
          </div>
        </Link>
        <Link to="/dashboard/admin/searches" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Search Logs</Text>
            </div>
            <Text size="sm" c="dimmed">
              View search queries and analytics
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/reindex" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Reindex</Text>
            </div>
            <Text size="sm" c="dimmed">
              Rebuild Elasticsearch indices from the database
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/reprocess" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Reprocess Media</Text>
            </div>
            <Text size="sm" c="dimmed">
              Re-transcode uploads through the current pipeline
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/storage-audit" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Storage Audit</Text>
            </div>
            <Text size="sm" c="dimmed">
              Reconcile S3 buckets against the database for orphaned or missing
              files
            </Text>
          </div>
        </Link>
        <Link to="/dashboard/admin/maintenance" className="block">
          <div className="dashboard-card" data-interactive="true">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
              <Text fw={500}>Maintenance Mode</Text>
              {maintenance?.maintenanceMode ? (
                <Badge color="orange" size="sm">
                  On
                </Badge>
              ) : null}
            </div>
            <Text size="sm" c="dimmed">
              Restrict the site to admins only
            </Text>
          </div>
        </Link>
      </div>
    </>
  );
}
