import {
  ActionIcon,
  Avatar,
  Badge,
  Container,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconSearch,
  IconTrash,
  IconUsers,
  IconVideo,
} from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

export const Route = createFileRoute('/dashboard_/admin_/channels')({
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
      trpc.dashboard.admin.getAllChannels.queryOptions(),
    );
    return {
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { filter?: 'all' | 'pending' | 'approved' } => {
    return {
      filter:
        search.filter === 'all' ||
        search.filter === 'pending' ||
        search.filter === 'approved'
          ? search.filter
          : 'all',
    };
  },
});

function ChannelApprovalsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { filter = 'all' } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);

  const { data } = useSuspenseQuery(
    trpc.dashboard.admin.getAllChannels.queryOptions({
      filter,
      search: debouncedSearch || undefined,
    }),
  );

  const { channels, pendingCount, approvedCount } = data;

  const approveChannelMutation = useMutation(
    trpc.dashboard.admin.approveChannel.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Channel approved successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getAllChannels.queryKey(),
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
          queryKey: trpc.dashboard.admin.getAllChannels.queryKey(),
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
    <Container size="xl" py="md">
      <Stack gap="lg">
        <div>
          <Title order={1} mb="xs">
            Channels
          </Title>
          <Text c="dimmed" size="sm">
            Manage all channels on the platform
          </Text>
        </div>

        <TextInput
          placeholder="Search channels by name or slug..."
          leftSection={<IconSearch size={16} />}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
        />

        <Tabs
          value={filter}
          onChange={(value) =>
            navigate({
              search: {
                filter: (value as 'all' | 'pending' | 'approved') || 'all',
              },
            })
          }
        >
          <Tabs.List>
            <Tabs.Tab
              value="all"
              rightSection={
                <Badge size="sm">{pendingCount + approvedCount}</Badge>
              }
            >
              All Channels
            </Tabs.Tab>
            <Tabs.Tab
              value="pending"
              rightSection={
                pendingCount > 0 ? (
                  <Badge size="sm" color="orange">
                    {pendingCount}
                  </Badge>
                ) : null
              }
            >
              Pending
            </Tabs.Tab>
            <Tabs.Tab
              value="approved"
              rightSection={
                <Badge size="sm" color="green">
                  {approvedCount}
                </Badge>
              }
            >
              Approved
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value={filter} pt="md">
            {channels.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">
                {debouncedSearch
                  ? 'No channels found matching your search.'
                  : filter === 'pending'
                    ? 'No pending channel approvals.'
                    : filter === 'approved'
                      ? 'No approved channels.'
                      : 'No channels found.'}
              </Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Channel</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Visibility</Table.Th>
                    <Table.Th>Stats</Table.Th>
                    <Table.Th>Owner</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {channels.map((channel) => (
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
                        {channel.approvedAt ? (
                          <Badge color="green" variant="light" size="sm">
                            Approved
                          </Badge>
                        ) : (
                          <Badge color="orange" variant="light" size="sm">
                            Pending
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={
                            channel.visibility === 'PUBLIC' ? 'blue' : 'gray'
                          }
                          variant="light"
                          size="sm"
                        >
                          {channel.visibility}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="md">
                          <Group gap={4}>
                            <IconVideo size={14} />
                            <Text size="xs">
                              {channel._count.uploadRecords}
                            </Text>
                          </Group>
                          <Group gap={4}>
                            <IconUsers size={14} />
                            <Text size="xs">{channel._count.subscribers}</Text>
                          </Group>
                        </Group>
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
                          {!channel.approvedAt ? (
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
                          ) : null}
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
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}
