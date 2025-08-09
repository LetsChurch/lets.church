import { Card, SimpleGrid, Text, Title } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard_/')({
  component: DashboardHome,
});

function DashboardHome() {
  return (
    <>
      <Title order={1} mb="lg">
        Dashboard
      </Title>
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
      </SimpleGrid>
    </>
  );
}
