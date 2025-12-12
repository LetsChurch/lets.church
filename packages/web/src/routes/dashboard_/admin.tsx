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
        trpc.dashboard.admin.getViewRangesMigrationStatus.queryOptions(),
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

function AdminPage() {
  const trpc = useTRPC();

  const { data: pendingApprovals } = useSuspenseQuery(
    trpc.dashboard.admin.getPendingApprovals.queryOptions(),
  );

  const { data: migrationStatus } = useSuspenseQuery(
    trpc.dashboard.admin.getViewRangesMigrationStatus.queryOptions(),
  );

  const { data: backupStats } = useSuspenseQuery(
    trpc.dashboard.admin.getUploadBackupStats.queryOptions(),
  );

  const { data: backfillStatus } = useSuspenseQuery(
    trpc.dashboard.admin.getBackfillFilenamesStatus.queryOptions(),
  );

  // Lazy-load counts that require workflow status checks
  const { data: processingUploadsCount, isLoading: isLoadingProcessing } =
    useQuery(trpc.dashboard.admin.getProcessingUploadsCount.queryOptions());

  const { data: failedUploadsCount, isLoading: isLoadingFailed } = useQuery(
    trpc.dashboard.admin.getFailedUploadsCount.queryOptions(),
  );

  return (
    <>
      <Title order={1} mb="lg">
        Admin
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
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
          to="/dashboard/admin/view-ranges-migration"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>View Ranges Migration</Text>
            <Badge
              color={
                migrationStatus.workflowStatus?.status === 'running'
                  ? 'blue'
                  : migrationStatus.remainingCount === 0
                    ? 'green'
                    : 'orange'
              }
              size="sm"
            >
              {migrationStatus.workflowStatus?.status === 'running'
                ? 'Running'
                : migrationStatus.remainingCount === 0
                  ? 'Done'
                  : migrationStatus.remainingCount.toLocaleString()}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Migrate UploadViewRanges to UploadViewSecond
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
          to="/dashboard/admin/newsletter-lists"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Newsletter Lists</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Configure mailing list subscriptions
          </Text>
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
      </SimpleGrid>
    </>
  );
}
