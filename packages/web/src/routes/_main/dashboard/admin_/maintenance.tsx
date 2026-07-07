import { Switch } from '@base-ui/react/switch';
import { IconAlertTriangle } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

import { Alert, Button, Text, Textarea, Title } from '@/components/ui';
import { notifications } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';
import { DEFAULT_MAINTENANCE_MESSAGE } from '@/util/maintenance-constants';

export const Route = createFileRoute('/_main/dashboard/admin_/maintenance')({
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
    <div className="flex max-w-[640px] flex-col gap-5">
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

      {/* oxlint-disable-next-line jsx-a11y/label-has-associated-control -- wraps a Base UI Switch (role=switch button) */}
      <label className="flex items-start gap-3">
        <Switch.Root
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(checked)}
          className="data-[checked]:bg-brand relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full bg-gray-300 p-0.5 transition-colors dark:bg-zinc-700"
        >
          <Switch.Thumb className="size-5 rounded-full bg-white shadow transition-transform data-[checked]:translate-x-5" />
        </Switch.Root>
        <span>
          <Text fw={500} size="sm">
            Enable maintenance mode
          </Text>
          <Text c="dimmed" size="xs">
            Restrict the site to admins only
          </Text>
        </span>
      </label>

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

      <div className="flex flex-wrap items-center justify-start gap-4">
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
      </div>
    </div>
  );
}
