import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconPlus,
  IconTrash,
  IconUserCheck,
  IconUserShield,
} from '@tabler/icons-react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useAppMantineForm } from '@/components/mantine';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';
import { showFailure, showSuccess } from '../-mantine';

type MembershipWithUser = {
  channelId: string;
  appUserId: string;
  isAdmin: boolean;
  canEdit: boolean;
  canUpload: boolean;
  createdAt: Date;
  appUser: {
    id: string;
    username: string;
    fullName: string | null;
    avatarUrl: string | null;
  };
};

export const Route = createFileRoute(
  '/dashboard_/channels_/$channelId_/members',
)({
  component: ChannelMembersPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.channels.getChannelMembers.queryOptions({
        channelId: params.channelId,
      }),
    );
    return {
      backNavigation: {
        label: 'Channel Members',
        to: '/dashboard/channels/$channelId',
        params: { channelId: params.channelId },
      },
    };
  },
});

function ChannelMembersPage() {
  const { channelId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: channel } = useSuspenseQuery(
    trpc.dashboard.channels.getChannelMembers.queryOptions({
      channelId,
    }),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 200);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const isAdmin = channel.canAdmin ?? false;

  const [
    addMemberModalOpened,
    { open: openAddMemberModal, close: closeAddMemberModal },
  ] = useDisclosure();

  const handleCloseModal = () => {
    closeAddMemberModal();
    setSearchQuery('');
    setSelectedUserId(null);
    form.reset();
  };

  const form = useAppMantineForm({
    defaultValues: {
      role: 'uploader',
    },
    onSubmit: async ({ value }) => {
      if (!selectedUserId) return;

      const permissions = {
        isAdmin: value.role === 'admin',
        canEdit: value.role === 'admin' || value.role === 'editor',
        canUpload: true,
      };

      addMemberMutation.mutate({
        channelId,
        userId: selectedUserId,
        ...permissions,
      });
    },
  });

  const { data: searchResults = [] } = useQuery({
    ...trpc.dashboard.channels.searchUsers.queryOptions({
      channelId,
      query: debouncedSearchQuery,
    }),
    enabled: debouncedSearchQuery.length >= 2,
    staleTime: 30000,
  });

  const addMemberMutation = useMutation(
    trpc.dashboard.channels.addChannelMember.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Member added successfully' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelMembers.queryKey({
            channelId,
          }),
        });
        handleCloseModal();
      },
      onError: (error) => {
        showFailure({ message: error.message || 'Failed to add member' });
      },
    }),
  );

  const removeMemberMutation = useMutation(
    trpc.dashboard.channels.removeChannelMember.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Member removed successfully' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelMembers.queryKey({
            channelId,
          }),
        });
      },
      onError: (error) => {
        showFailure({ message: error.message || 'Failed to remove member' });
      },
    }),
  );

  const handleRemoveMember = (appUserId: string) => {
    removeMemberMutation.mutate({
      channelId,
      appUserId,
    });
  };

  const getRoleLabel = (membership: MembershipWithUser) => {
    if (membership.isAdmin) return 'Admin';
    const roles = [];
    if (membership.canEdit) roles.push('Edit');
    if (membership.canUpload) roles.push('Upload');
    return roles.length > 0 ? roles.join(', ') : 'Member';
  };

  const getRoleBadgeColor = (membership: MembershipWithUser) => {
    if (membership.isAdmin) return 'blue';
    if (membership.canEdit) return 'green';
    if (membership.canUpload) return 'yellow';
    return 'gray';
  };

  const getRoleIcon = (membership: MembershipWithUser) => {
    if (membership.isAdmin) return <IconUserShield size={14} />;
    return <IconUserCheck size={14} />;
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1}>Members</Title>
          <Text c="dimmed">
            {channel.name} • {channel.memberships?.length || 0} total members
          </Text>
        </div>

        <Tooltip
          label={
            isAdmin
              ? 'Add a new member to this channel'
              : 'Only admins can add members'
          }
          disabled={isAdmin}
        >
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openAddMemberModal}
            disabled={!isAdmin}
          >
            Add Member
          </Button>
        </Tooltip>
      </Group>

      <Modal
        opened={addMemberModalOpened}
        onClose={handleCloseModal}
        title="Add Channel Member"
        size="md"
        centered
      >
        <Stack gap="md">
          <div>
            <TextInput
              label="Search for user"
              placeholder="Start typing a username..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.currentTarget.value);
                setSelectedUserId(null);
              }}
              mb="xs"
            />

            {debouncedSearchQuery.length >= 2 && searchResults.length > 0 && (
              <Stack gap="xs" mah={200} style={{ overflowY: 'auto' }}>
                {searchResults.map((user) => (
                  <Group
                    key={user.id}
                    p="sm"
                    bg={selectedUserId === user.id ? 'blue.1' : 'gray.0'}
                    style={{
                      borderRadius: 8,
                      cursor: 'pointer',
                      border:
                        selectedUserId === user.id
                          ? '1px solid var(--mantine-color-blue-6)'
                          : '1px solid transparent',
                    }}
                    onClick={() => {
                      setSelectedUserId(user.id);
                      setSearchQuery(user.username);
                    }}
                  >
                    <Avatar size="sm" src={user.avatarUrl}>
                      {user.username.charAt(0).toUpperCase()}
                    </Avatar>
                    <div>
                      <Text size="sm" fw={500}>
                        {user.username}
                      </Text>
                      {user.fullName && (
                        <Text size="xs" c="dimmed">
                          {user.fullName}
                        </Text>
                      )}
                    </div>
                  </Group>
                ))}
              </Stack>
            )}

            {debouncedSearchQuery.length >= 2 && searchResults.length === 0 && (
              <Text size="sm" c="dimmed" p="sm">
                No users found matching "{debouncedSearchQuery}"
              </Text>
            )}
          </div>

          {selectedUserId && (
            <>
              <Text size="sm" fw={500}>
                Permissions
              </Text>

              <form.AppField name="role">
                {(field) => (
                  <field.SelectField
                    label="Role"
                    data={[
                      { value: 'admin', label: 'Admin - Full access' },
                      {
                        value: 'editor',
                        label: 'Editor - Can edit and upload',
                      },
                      {
                        value: 'uploader',
                        label: 'Uploader - Can upload only',
                      },
                    ]}
                  />
                )}
              </form.AppField>

              <Text size="xs" c="dimmed" mt="xs">
                <strong>Note:</strong> You can only add someone who already has
                a Let's Church account. If they don't have an account yet, have
                them join Let's Church first.
              </Text>
            </>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <Group justify="flex-end" mt="md">
              <Button variant="outline" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedUserId}
                loading={addMemberMutation.isPending}
              >
                Add Member
              </Button>
            </Group>
          </form>
        </Stack>
      </Modal>

      <Table verticalSpacing="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Member</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Joined</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {channel.memberships?.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text ta="center" c="dimmed" py="xl">
                  No members found
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            channel.memberships?.map((membership: MembershipWithUser) => (
              <Table.Tr key={`${membership.channelId}-${membership.appUserId}`}>
                <Table.Td>
                  <Group gap="sm">
                    <Avatar size="sm" src={membership.appUser.avatarUrl}>
                      {membership.appUser.username.charAt(0).toUpperCase()}
                    </Avatar>
                    <div>
                      <Text size="sm" fw={500}>
                        {membership.appUser.username}
                        {membership.appUser.id ===
                          channel.userMembership?.appUserId && (
                          <Text component="span" size="xs" c="dimmed" ml={4}>
                            (you)
                          </Text>
                        )}
                      </Text>
                      {membership.appUser.fullName && (
                        <Text size="xs" c="dimmed">
                          {membership.appUser.fullName}
                        </Text>
                      )}
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={getRoleBadgeColor(membership)}
                    size="sm"
                    leftSection={getRoleIcon(membership)}
                  >
                    {getRoleLabel(membership)}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {formatDate(membership.createdAt, 'short')}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {(() => {
                    const isSelf =
                      membership.appUser.id ===
                      channel.userMembership?.appUserId;
                    const canRemove = isAdmin && !isSelf;
                    const tooltipText = !isAdmin
                      ? 'Only admins can remove members'
                      : isSelf
                        ? 'You cannot remove yourself'
                        : 'Remove this member from the channel';

                    return (
                      <Tooltip label={tooltipText}>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          disabled={!canRemove}
                          onClick={() =>
                            canRemove &&
                            handleRemoveMember(membership.appUserId)
                          }
                          loading={removeMemberMutation.isPending}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    );
                  })()}
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
