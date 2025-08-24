import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { hasValidSession } from '../-functions';

export const Route = createFileRoute('/dashboard_/account')({
  component: AccountPage,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: () => ({
    backNavigation: {
      label: 'Dashboard',
      to: '/dashboard',
    },
  }),
});

function AccountPage() {
  return (
    <>
      <Title order={1} mb="lg">
        Account Settings
      </Title>

      <Stack gap="lg">
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group justify="space-between" align="flex-start" mb="xs">
            <Text fw={500}>Profile Information</Text>
            <Button variant="light" size="sm" w={120}>
              Edit
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Update your personal information and profile settings.
          </Text>
        </Card>

        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group justify="space-between" align="flex-start" mb="xs">
            <Text fw={500}>Password & Security</Text>
            <Button variant="light" size="sm" w={120}>
              Change
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Manage your password and security preferences.
          </Text>
        </Card>

        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group justify="space-between" align="flex-start" mb="xs">
            <Text fw={500}>Notifications</Text>
            <Button variant="light" size="sm" w={120}>
              Configure
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Choose what notifications you want to receive.
          </Text>
        </Card>

        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group justify="space-between" align="flex-start" mb="xs">
            <Text fw={500}>Privacy Settings</Text>
            <Button variant="light" size="sm" w={120}>
              Manage
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Control your privacy and data sharing preferences.
          </Text>
        </Card>
      </Stack>
    </>
  );
}
