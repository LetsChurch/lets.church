import {
  ActionIcon,
  Avatar,
  Badge,
  Container,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconTrash } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

export const Route = createFileRoute('/dashboard_/admin_/channel-approvals')({
  component: ChannelApprovalsPage,
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
      trpc.dashboard.admin.getPendingChannelApprovals.queryOptions(),
    );
    return {
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
});

function ChannelApprovalsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: pendingChannels } = useSuspenseQuery(
    trpc.dashboard.admin.getPendingChannelApprovals.queryOptions(),
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
          queryKey: trpc.dashboard.admin.getPendingChannelApprovals.queryKey(),
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

  const deleteChannelMutation = useMutation(
    trpc.dashboard.admin.deleteChannel.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Channel deleted successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getPendingChannelApprovals.queryKey(),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to delete channel',
          color: 'red',
        });
      },
    }),
  );

  const handleApproveChannel = (channelId: string) => {
    approveChannelMutation.mutate({ channelId });
  };

  const handleDeleteChannel = (channelId: string) => {
    deleteChannelMutation.mutate({ channelId });
  };

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="sm" mb="xs">
              <Title order={1}>Channel Approvals</Title>
              <Badge color="orange" size="sm">
                {pendingChannels.length} Pending
              </Badge>
            </Group>
            <Text c="dimmed" size="sm">
              Review and approve pending channel applications
            </Text>
          </div>
        </Group>

        {pendingChannels.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No pending channel approvals.
          </Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Channel</Table.Th>
                <Table.Th>Visibility</Table.Th>
                <Table.Th>Owner</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pendingChannels.map((channel) => (
                <Table.Tr key={channel.id}>
                  <Table.Td>
                    <Group gap="sm">
                      <Avatar
                        size="sm"
                        src={
                          channel.avatarPath
                            ? `/api/media/${channel.avatarPath}`
                            : null
                        }
                        alt={channel.name}
                      >
                        {channel.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <div>
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
                        <Text size="xs" c="dimmed">
                          @{channel.slug}
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={
                        channel.visibility === 'PUBLIC' ? 'green' : 'orange'
                      }
                      variant="light"
                      size="sm"
                    >
                      {channel.visibility}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {channel.memberships[0]?.appUser ? (
                      <div>
                        <Text size="sm" fw={500}>
                          {channel.memberships[0].appUser.fullName}
                        </Text>
                        {channel.memberships[0].appUser.emails[0] && (
                          <Text size="xs" c="dimmed">
                            {channel.memberships[0].appUser.emails[0].email}
                          </Text>
                        )}
                      </div>
                    ) : (
                      <Text size="sm" c="dimmed">
                        No owner
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {formatDate(channel.createdAt)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon
                        color="green"
                        variant="light"
                        size="sm"
                        onClick={() => handleApproveChannel(channel.id)}
                        loading={
                          approveChannelMutation.isPending &&
                          approveChannelMutation.variables?.channelId ===
                            channel.id
                        }
                        aria-label="Approve channel"
                      >
                        <IconCheck size={14} />
                      </ActionIcon>
                      <ActionIcon
                        color="red"
                        variant="light"
                        size="sm"
                        onClick={() => handleDeleteChannel(channel.id)}
                        loading={
                          deleteChannelMutation.isPending &&
                          deleteChannelMutation.variables?.channelId ===
                            channel.id
                        }
                        aria-label="Delete channel"
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Container>
  );
}
