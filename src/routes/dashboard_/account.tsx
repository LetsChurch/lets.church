import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import clsx from 'clsx';
import styles from './-styles.module.css';

export const Route = createFileRoute('/dashboard_/account')({
  component: AccountPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: () => ({
    backNavigation: {
      label: 'Dashboard',
      to: '/dashboard',
    },
  }),
});

const actionWidth = 140;

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
            <Button
              variant="light"
              size="sm"
              w={actionWidth}
              renderRoot={(rootProps) => (
                <Link
                  {...rootProps}
                  className={clsx(rootProps.className, styles.buttonLink)}
                  to="/dashboard/account/profile"
                >
                  Edit
                </Link>
              )}
            />
          </Group>
          <Text size="sm" c="dimmed">
            Update your personal information and profile settings.
          </Text>
        </Card>

        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group justify="space-between" align="flex-start" mb="xs">
            <Text fw={500}>Password & Security</Text>
            <Button
              variant="light"
              size="sm"
              w={actionWidth}
              renderRoot={(rootProps) => (
                <Link
                  {...rootProps}
                  className={clsx(rootProps.className, styles.buttonLink)}
                  to="/dashboard/account/security"
                >
                  Change
                </Link>
              )}
            />
          </Group>
          <Text size="sm" c="dimmed">
            Manage your password and security preferences.
          </Text>
        </Card>

        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group justify="space-between" align="flex-start" mb="xs">
            <Text fw={500}>Notifications</Text>
            <Button variant="light" size="sm" w={actionWidth} disabled>
              Coming Soon
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Choose what notifications you want to receive.
          </Text>
        </Card>
      </Stack>
    </>
  );
}
