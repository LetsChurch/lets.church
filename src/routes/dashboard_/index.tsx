import { Card, SimpleGrid, Text } from '@mantine/core';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/dashboard_/')({
  component: DashboardHome,
});

function DashboardHome() {
  const trpc = useTRPC();

  const { data: currentUser } = useSuspenseQuery(
    trpc.common.getCurrentUser.queryOptions(),
  );

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      <Card
        shadow="xs"
        padding="lg"
        radius="md"
        withBorder
        component={Link}
        to="/dashboard/account"
      >
        <Text fw={500}>Account</Text>
        <Text size="sm" c="dimmed">
          Manage your account settings and profile
        </Text>
      </Card>
      <Card
        shadow="xs"
        padding="lg"
        radius="md"
        withBorder
        component={Link}
        to="/dashboard/channels"
      >
        <Text fw={500}>Channels</Text>
        <Text size="sm" c="dimmed">
          Create and manage your channels
        </Text>
      </Card>
      <Card
        shadow="xs"
        padding="lg"
        radius="md"
        withBorder
        component={Link}
        to="/dashboard/churches"
      >
        <Text fw={500}>Churches</Text>
        <Text size="sm" c="dimmed">
          Browse and connect with churches
        </Text>
      </Card>
      <Card
        shadow="xs"
        padding="lg"
        radius="md"
        withBorder
        component={Link}
        to="/dashboard/organizations"
      >
        <Text fw={500}>Organizations</Text>
        <Text size="sm" c="dimmed">
          Browse and connect with organizations
        </Text>
      </Card>
      {currentUser.role === 'ADMIN' && (
        <Card
          shadow="xs"
          padding="lg"
          radius="md"
          withBorder
          component={Link}
          to="/dashboard/admin"
        >
          <Text fw={500}>Admin</Text>
          <Text size="sm" c="dimmed">
            Manage approvals and site administration
          </Text>
        </Card>
      )}
    </SimpleGrid>
  );
}
