import { Button, Checkbox, Group, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/dashboard_/admin_/newsletter-lists')({
  component: NewsletterListsPage,
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
      trpc.dashboard.admin.newsletterLists.getConfiguredLists.queryOptions(),
    );
    return {
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
});

type ConfiguredList = {
  listmonkUuid: string;
  name: string;
  type: 'PUBLIC' | 'PRIVATE';
  optin: 'SINGLE' | 'DOUBLE';
  enabled: boolean;
  subscribeOnRegistration: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function NewsletterListsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: configuredLists } = useSuspenseQuery(
    trpc.dashboard.admin.newsletterLists.getConfiguredLists.queryOptions(),
  );

  const syncMutation = useMutation(
    trpc.dashboard.admin.newsletterLists.syncListsFromListmonk.mutationOptions({
      onSuccess: async (data) => {
        await queryClient.invalidateQueries(
          trpc.dashboard.admin.newsletterLists.getConfiguredLists.queryOptions(),
        );
        notifications.show({
          title: 'Success',
          message: `Synced ${data.syncedCount} lists from Listmonk`,
          color: 'green',
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to sync lists from Listmonk',
          color: 'red',
        });
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.dashboard.admin.newsletterLists.updateListConfiguration.mutationOptions(
      {
        onMutate: async (variables) => {
          // Cancel any outgoing refetches
          await queryClient.cancelQueries(
            trpc.dashboard.admin.newsletterLists.getConfiguredLists.queryOptions(),
          );

          // Snapshot the previous value
          const previousLists = queryClient.getQueryData(
            trpc.dashboard.admin.newsletterLists.getConfiguredLists.queryOptions()
              .queryKey,
          );

          // Optimistically update to the new value
          queryClient.setQueryData(
            trpc.dashboard.admin.newsletterLists.getConfiguredLists.queryOptions()
              .queryKey,
            (old: ConfiguredList[] | undefined) => {
              if (!old) return old;
              return old.map((list) =>
                list.listmonkUuid === variables.listmonkUuid
                  ? {
                      ...list,
                      ...(variables.enabled !== undefined && {
                        enabled: variables.enabled,
                      }),
                      ...(variables.subscribeOnRegistration !== undefined && {
                        subscribeOnRegistration:
                          variables.subscribeOnRegistration,
                      }),
                    }
                  : list,
              );
            },
          );

          // Return a context object with the snapshotted value
          return { previousLists };
        },
        onError: (_err, _variables, context) => {
          // If the mutation fails, use the context returned from onMutate to roll back
          if (context?.previousLists) {
            queryClient.setQueryData(
              trpc.dashboard.admin.newsletterLists.getConfiguredLists.queryOptions()
                .queryKey,
              context.previousLists,
            );
          }
          notifications.show({
            title: 'Error',
            message: 'Failed to update list configuration',
            color: 'red',
          });
        },
        onSettled: () => {
          // Always refetch after error or success to ensure we're in sync with the server
          queryClient.invalidateQueries(
            trpc.dashboard.admin.newsletterLists.getConfiguredLists.queryOptions(),
          );
        },
      },
    ),
  );

  return (
    <>
      <Group justify="space-between" mb="lg">
        <Title order={1}>Newsletter Lists</Title>
        <Button
          leftSection={<IconRefresh size={16} />}
          onClick={() => syncMutation.mutate()}
          loading={syncMutation.isPending}
        >
          Sync from Listmonk
        </Button>
      </Group>

      {configuredLists.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          No lists found. Click "Sync from Listmonk" to load available lists.
        </Text>
      ) : (
        <>
          <Text size="sm" c="dimmed" mb="md">
            Configure which Listmonk mailing lists are available for newsletter
            subscriptions. Lists marked as "Auto-subscribe on registration" will
            be automatically subscribed when users register with the newsletter
            checkbox enabled.
          </Text>

          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Enabled</Table.Th>
                <Table.Th>Auto-subscribe on Registration</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {configuredLists.map((list) => (
                <Table.Tr key={list.listmonkUuid}>
                  <Table.Td>
                    <Text fw={500}>{list.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Checkbox
                      checked={list.enabled}
                      onChange={(event) => {
                        updateMutation.mutate({
                          listmonkUuid: list.listmonkUuid,
                          enabled: event.currentTarget.checked,
                        });
                      }}
                      disabled={updateMutation.isPending}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Checkbox
                      checked={list.subscribeOnRegistration}
                      onChange={(event) => {
                        updateMutation.mutate({
                          listmonkUuid: list.listmonkUuid,
                          subscribeOnRegistration: event.currentTarget.checked,
                        });
                      }}
                      disabled={updateMutation.isPending || !list.enabled}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </>
  );
}
