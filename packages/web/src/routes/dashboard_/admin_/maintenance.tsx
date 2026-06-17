import {
  Alert,
  Button,
  Group,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useTRPC } from '@/trpc/react';
import { DEFAULT_MAINTENANCE_MESSAGE } from '@/util/maintenance-constants';

export const Route = createFileRoute('/dashboard_/admin_/maintenance')({
  component: MaintenancePage,
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
      trpc.dashboard.admin.getMaintenanceSettings.queryOptions(),
    );
    return {
      backNavigation: {
        label: 'Admin Dashboard',
        to: '/dashboard/admin',
      },
    };
  },
});

function MaintenancePage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: settings } = useSuspenseQuery(
    trpc.dashboard.admin.getMaintenanceSettings.queryOptions(),
  );

  const [enabled, setEnabled] = useState(settings.maintenanceMode);
  const [message, setMessage] = useState(settings.maintenanceMessage ?? '');

  const mutation = useMutation(
    trpc.dashboard.admin.setMaintenanceMode.mutationOptions({
      onSuccess: async (data) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getMaintenanceSettings.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.common.getMaintenanceStatus.queryKey(),
        });
        notifications.show({
          color: data.maintenanceMode ? 'orange' : 'green',
          title: data.maintenanceMode
            ? 'Maintenance mode enabled'
            : 'Maintenance mode disabled',
          message: data.maintenanceMode
            ? 'Only site admins can access the site.'
            : 'The site is publicly accessible again.',
        });
      },
      onError: (error) => {
        notifications.show({
          color: 'red',
          title: 'Failed to update maintenance mode',
          message: error.message,
        });
      },
    }),
  );

  const dirty =
    enabled !== settings.maintenanceMode ||
    message.trim() !== (settings.maintenanceMessage ?? '');

  return (
    <Stack gap="lg" maw={640}>
      <Title order={1}>Maintenance Mode</Title>

      <Text c="dimmed">
        When maintenance mode is on, only site administrators can access the
        site. Everyone else is shown a maintenance page. Admins can still log in
        at{' '}
        <Text span fw={500}>
          /auth/login
        </Text>
        .
      </Text>

      {enabled ? (
        <Alert
          color="orange"
          icon={<IconAlertTriangle size={18} />}
          title="The public site is currently locked down"
        >
          Regular users and anonymous visitors cannot access the site while this
          is enabled.
        </Alert>
      ) : null}

      <Switch
        size="lg"
        checked={enabled}
        onChange={(event) => setEnabled(event.currentTarget.checked)}
        label="Enable maintenance mode"
        description="Restrict the site to admins only"
      />

      <Textarea
        label="Maintenance message"
        description="Shown to visitors on the maintenance page. Leave blank to use the default."
        placeholder={DEFAULT_MAINTENANCE_MESSAGE}
        autosize
        minRows={3}
        maxRows={8}
        maxLength={1000}
        value={message}
        onChange={(event) => setMessage(event.currentTarget.value)}
      />

      <Group>
        <Button
          loading={mutation.isPending}
          disabled={!dirty}
          color={enabled ? 'orange' : undefined}
          onClick={() =>
            mutation.mutate({
              maintenanceMode: enabled,
              maintenanceMessage: message,
            })
          }
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}
