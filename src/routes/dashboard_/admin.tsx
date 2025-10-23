import { Badge, Card, Group, SimpleGrid, Text, Title } from '@mantine/core';
import { useSuspenseQuery } from '@tanstack/react-query';
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
    await queryClient.ensureQueryData(
      trpc.dashboard.admin.getPendingApprovals.queryOptions(),
    );
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
          to="/dashboard/admin/channel-approvals"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Channel Approvals</Text>
            <Badge color="orange" size="sm">
              {pendingApprovals.channels.length}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Review and approve pending channels
          </Text>
        </Card>
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin/organization-approvals"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Organization Approvals</Text>
            <Badge color="orange" size="sm">
              {pendingApprovals.organizations.length}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Review and approve pending organizations
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
          to="/dashboard/admin/processing-uploads"
        >
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Processing Uploads</Text>
            <Badge color="yellow" size="sm">
              {pendingApprovals.processingUploadsCount}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Monitor uploads currently being processed
          </Text>
        </Card>
      </SimpleGrid>
    </>
  );
}
