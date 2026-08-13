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

import { DeleteChannelModal } from '@/components/delete-channel-modal';
import {
  ActionIcon,
  Avatar,
  Badge,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@/components/ui';
import { notifications } from '@/components/ui/notifications';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import { formatDate } from '@/util/format';

export const Route = createFileRoute('/_main/dashboard/admin_/channels')({
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
  const [
    deleteModalOpened,
    { open: openDeleteModal, close: closeDeleteModal },
  ] = useDisclosure(false);
  const [channelToDelete, setChannelToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

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
          title: 'Deletion Started',
          message:
            'Channel deletion is in progress. This may take several minutes.',
          color: 'blue',
        });
        closeDeleteModal();
        setChannelToDelete(null);
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getAllChannels.queryKey(),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to start channel deletion',
          color: 'red',
        });
      },
    }),
  );

  const handleApproveChannel = (channelId: string) => {
    approveChannelMutation.mutate({ channelId });
  };

  const handleDeleteChannel = (channelId: string, channelName: string) => {
    setChannelToDelete({ id: channelId, name: channelName });
    openDeleteModal();
  };

  const confirmDeleteChannel = () => {
    if (channelToDelete) {
      deleteChannelMutation.mutate({
        channelId: channelToDelete.id,
        channelName: channelToDelete.name,
      });
    }
  };

  return (
    <div className="w-full">
      <div className="flex flex-col gap-5">
        <div>
          <Title order={1} className="mb-2.5">
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

          <Tabs.Panel value={filter} className="pt-4">
            {channels.length === 0 ? (
              <Text c="dimmed" ta="center" className="py-8">
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
                        <div className="flex flex-wrap items-center justify-start gap-3">
                          <Avatar
                            src={channel.avatarUrl}
                            alt={channel.name}
                            className="size-8"
                          />
                          <div>
                            <Link
                              to="/dashboard/channels/$channelId"
                              params={{ channelId: channel.id }}
                              className={cn(
                                'font-medium',
                                channel.deletedAt
                                  ? 'text-secondary line-through'
                                  : 'text-primary',
                              )}
                            >
                              {channel.name}
                            </Link>
                            <Text
                              size="xs"
                              c="dimmed"
                              className={
                                channel.deletedAt ? 'line-through' : undefined
                              }
                            >
                              @{channel.slug}
                            </Text>
                          </div>
                        </div>
                      </Table.Td>
                      <Table.Td>
                        {channel.deletedAt ? (
                          <Badge color="red" variant="light" size="sm">
                            Deleting
                          </Badge>
                        ) : channel.approvedAt ? (
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
                        <div className="flex flex-wrap items-center justify-start gap-4">
                          <div className="flex flex-wrap items-center justify-start gap-[4px]">
                            <IconVideo size={14} />
                            <Text size="xs">
                              {channel._count.uploadRecords}
                            </Text>
                          </div>
                          <div className="flex flex-wrap items-center justify-start gap-[4px]">
                            <IconUsers size={14} />
                            <Text size="xs">{channel._count.subscribers}</Text>
                          </div>
                        </div>
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
                        <div className="flex flex-wrap items-center justify-start gap-2.5">
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
                            onClick={() =>
                              handleDeleteChannel(channel.id, channel.name)
                            }
                            loading={
                              deleteChannelMutation.isPending &&
                              deleteChannelMutation.variables?.channelId ===
                                channel.id
                            }
                            aria-label="Delete channel"
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </div>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Tabs.Panel>
        </Tabs>
      </div>

      {channelToDelete ? (
        <DeleteChannelModal
          opened={deleteModalOpened}
          onClose={closeDeleteModal}
          onConfirm={confirmDeleteChannel}
          channelName={channelToDelete.name}
          isDeleting={deleteChannelMutation.isPending}
        />
      ) : null}
    </div>
  );
}
