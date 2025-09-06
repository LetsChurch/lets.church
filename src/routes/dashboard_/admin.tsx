import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconInfoCircle } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';
import classes from './-admin.module.css';

export const Route = createFileRoute('/dashboard_/admin')({
  component: AdminPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      return redirect({ to: '/auth/login' });
    }

    // Check if user is admin
    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );
    if (currentUser.role !== 'ADMIN') {
      return redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    const data = await queryClient.ensureQueryData(
      trpc.dashboard.admin.getPendingApprovals.queryOptions(),
    );
    return {
      data,
      backNavigation: {
        label: 'Dashboard',
        to: '/dashboard',
      },
    };
  },
});

function AdminPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: pendingApprovals } = useSuspenseQuery(
    trpc.dashboard.admin.getPendingApprovals.queryOptions(),
  );

  const approveChannelMutation = useMutation(
    trpc.dashboard.admin.approveChannel.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Channel approved successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getPendingApprovals.queryKey(),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to approve channel',
          color: 'red',
        });
      },
    }),
  );

  const approveOrganizationMutation = useMutation(
    trpc.dashboard.admin.approveOrganization.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Organization approved successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getPendingApprovals.queryKey(),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to approve organization',
          color: 'red',
        });
      },
    }),
  );

  const handleApproveChannel = (channelId: string) => {
    approveChannelMutation.mutate({ channelId });
  };

  const handleApproveOrganization = (organizationId: string) => {
    approveOrganizationMutation.mutate({ organizationId });
  };

  return (
    <>
      <Title order={1} mb="lg">
        Admin Panel
      </Title>

      {pendingApprovals.channels.length === 0 &&
        pendingApprovals.organizations.length === 0 && (
          <Alert
            icon={<IconInfoCircle size="1rem" />}
            title="All caught up!"
            color="green"
          >
            There are no pending approvals at this time.
          </Alert>
        )}

      {pendingApprovals.channels.length > 0 && (
        <>
          <Title order={2} size="h3" mb="md" className={classes.stickyHeading}>
            Pending Channel Approvals ({pendingApprovals.channels.length})
          </Title>
          <Box mb="xl">
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Channel</Table.Th>
                  <Table.Th>Admin Contact</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pendingApprovals.channels.map((channel) => {
                  const admin = channel.memberships?.[0]?.appUser;
                  const adminEmail = admin?.emails?.[0]?.email;
                  return (
                    <Table.Tr key={channel.id}>
                      <Table.Td>
                        <Stack gap="xs">
                          <Group justify="space-between" align="center">
                            <Text
                              fw={500}
                              renderRoot={(rootProps) => (
                                <Link
                                  {...rootProps}
                                  to="/dashboard/channels/$channelId"
                                  params={{ channelId: channel.id }}
                                  style={{
                                    textDecoration: 'none',
                                    color: 'inherit',
                                  }}
                                >
                                  {channel.name}
                                </Link>
                              )}
                            />
                            <Badge color="yellow" variant="light" size="sm">
                              Pending
                            </Badge>
                          </Group>
                          <Text size="sm" c="dimmed">
                            @{channel.slug}
                          </Text>
                          {channel.description && (
                            <Text size="sm" c="dimmed" lineClamp={2}>
                              {channel.description}
                            </Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        {admin ? (
                          <Stack gap="xs">
                            <Text size="sm">{admin.fullName || 'No name'}</Text>
                            <Text size="xs" c="dimmed">
                              {adminEmail || 'No email'}
                            </Text>
                          </Stack>
                        ) : (
                          <Text size="sm" c="dimmed">
                            No admin found
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {new Date(channel.createdAt).toLocaleDateString()}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="sm"
                          leftSection={<IconCheck size={16} />}
                          onClick={() => handleApproveChannel(channel.id)}
                          loading={approveChannelMutation.isPending}
                        >
                          Approve
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Box>
        </>
      )}

      {pendingApprovals.organizations.length > 0 && (
        <>
          <Title order={2} size="h3" mb="md" className={classes.stickyHeading}>
            Pending Organization Approvals (
            {pendingApprovals.organizations.length})
          </Title>
          <Box>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Organization</Table.Th>
                  <Table.Th>Admin Contact</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pendingApprovals.organizations.map((organization) => {
                  const admin = organization.memberships?.[0]?.appUser;
                  const adminEmail = admin?.emails?.[0]?.email;
                  return (
                    <Table.Tr key={organization.id}>
                      <Table.Td>
                        <Stack gap="xs">
                          <Group justify="space-between" align="center">
                            <Text
                              fw={500}
                              renderRoot={(rootProps) => (
                                <Link
                                  {...rootProps}
                                  to="/dashboard/organizations/$orgId"
                                  params={{ orgId: organization.id }}
                                  style={{
                                    textDecoration: 'none',
                                    color: 'inherit',
                                  }}
                                >
                                  {organization.name}
                                </Link>
                              )}
                            />
                            <Group gap="xs">
                              <Badge color="blue" variant="light" size="sm">
                                {organization.type}
                              </Badge>
                              <Badge color="yellow" variant="light" size="sm">
                                Pending
                              </Badge>
                            </Group>
                          </Group>
                          <Text size="sm" c="dimmed">
                            @{organization.slug}
                          </Text>
                          {organization.description && (
                            <Text size="sm" c="dimmed" lineClamp={2}>
                              {organization.description}
                            </Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        {admin ? (
                          <Stack gap="xs">
                            <Text size="sm">{admin.fullName || 'No name'}</Text>
                            <Text size="xs" c="dimmed">
                              {adminEmail || 'No email'}
                            </Text>
                          </Stack>
                        ) : (
                          <Text size="sm" c="dimmed">
                            No admin found
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {new Date(
                            organization.createdAt,
                          ).toLocaleDateString()}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="sm"
                          leftSection={<IconCheck size={16} />}
                          onClick={() =>
                            handleApproveOrganization(organization.id)
                          }
                          loading={approveOrganizationMutation.isPending}
                        >
                          Approve
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Box>
        </>
      )}
    </>
  );
}
