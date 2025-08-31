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
import { createServerFn } from '@tanstack/react-start';
import { invariant } from 'es-toolkit';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';
import { z } from 'zod';
import { useAppMantineForm } from '@/components/mantine';
import db from '@/util/db';
import { formatDate } from '@/util/format';
import {
  hasValidSession,
  requireAuthMiddleware,
  requireChannelAdminAccessMiddleware,
} from '../-functions';
import { showFailure, showSuccess } from '../-mantine';
import { dashboardQueryKeys } from './-query-keys';

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
    avatarPath: string | null;
  };
};

const getChannelMembers = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ channelId: z.string() }))
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    const channel = await db.channel.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        memberships: {
          select: {
            channelId: true,
            appUserId: true,
            isAdmin: true,
            canEdit: true,
            canUpload: true,
            createdAt: true,
            appUser: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatarPath: true,
              },
            },
          },
          orderBy: [{ isAdmin: 'desc' }, { createdAt: 'asc' }],
        },
      },
      where: {
        id: data.channelId,
        memberships: {
          some: {
            appUserId: context.session.appUser.id,
          },
        },
      },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    const userMembership = channel.memberships.find(
      (m: MembershipWithUser) => m.appUser.id === context.session?.appUser.id,
    );

    return {
      ...channel,
      userMembership,
    } as const;
  });

const searchUsers = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      channelId: z.string(),
      query: z.string().min(1),
    }),
  )
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    // Verify user has admin access to the channel
    const channel = await db.channel.findFirst({
      where: {
        id: data.channelId,
        memberships: {
          some: {
            appUserId: context.session.appUser.id,
            isAdmin: true,
          },
        },
      },
    });

    if (!channel) {
      throw new Error('Channel not found or insufficient permissions');
    }

    // Search for users who are not already members of the channel
    const users = await db.appUser.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        avatarPath: true,
      },
      where: {
        username: {
          contains: data.query,
          mode: 'insensitive',
        },
        NOT: {
          channelMemberships: {
            some: {
              channelId: data.channelId,
            },
          },
        },
      },
      take: 10,
    });

    return users;
  });

const addChannelMember = createServerFn({ method: 'POST' })
  .middleware([requireChannelAdminAccessMiddleware])
  .validator(
    z.object({
      channelId: z.string(),
      userId: z.string(),
      isAdmin: z.boolean().default(false),
      canEdit: z.boolean().default(false),
      canUpload: z.boolean().default(true),
    }),
  )
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    // Add the member
    await db.channelMembership.create({
      data: {
        channelId: data.channelId,
        appUserId: data.userId,
        isAdmin: data.isAdmin,
        canEdit: data.canEdit,
        canUpload: data.canUpload,
      },
    });

    return { success: true };
  });

const removeChannelMember = createServerFn({ method: 'POST' })
  .middleware([requireChannelAdminAccessMiddleware])
  .validator(
    z.object({
      channelId: z.string(),
      appUserId: z.string(),
    }),
  )
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    // Don't allow removing the last admin
    const adminCount = await db.channelMembership.count({
      where: {
        channelId: data.channelId,
        isAdmin: true,
      },
    });

    const membershipToDelete = await db.channelMembership.findUnique({
      where: {
        channelId_appUserId: {
          channelId: data.channelId,
          appUserId: data.appUserId,
        },
      },
      select: { isAdmin: true, appUserId: true },
    });

    if (membershipToDelete?.isAdmin && adminCount <= 1) {
      throw new Error('Cannot remove the last admin from the channel');
    }

    // Don't allow removing yourself
    if (membershipToDelete?.appUserId === context.session.appUser.id) {
      throw new Error('You cannot remove yourself from the channel');
    }

    await db.channelMembership.delete({
      where: {
        channelId_appUserId: {
          channelId: data.channelId,
          appUserId: data.appUserId,
        },
      },
    });

    return { success: true };
  });

const channelMembersQueryOptions = (channelId: string) => ({
  queryKey: dashboardQueryKeys.channels.members(channelId),
  queryFn: () => getChannelMembers({ data: { channelId } }),
});

export const Route = createFileRoute(
  '/dashboard_/channels_/$channelId_/members',
)({
  component: ChannelMembersPage,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(
      channelMembersQueryOptions(params.channelId),
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
  const { data: channel } = useSuspenseQuery(
    channelMembersQueryOptions(channelId),
  );
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 200);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const isAdmin = channel.userMembership?.isAdmin ?? false;

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
        data: {
          channelId,
          userId: selectedUserId,
          ...permissions,
        },
      });
    },
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: dashboardQueryKeys.users.search(channelId, debouncedSearchQuery),
    queryFn: () =>
      searchUsers({ data: { channelId, query: debouncedSearchQuery } }),
    enabled: debouncedSearchQuery.length >= 2,
    staleTime: 30000,
  });

  const addMemberMutation = useMutation({
    mutationFn: addChannelMember,
    onSuccess: () => {
      showSuccess({ message: 'Member added successfully' });
      queryClient.invalidateQueries({
        queryKey: dashboardQueryKeys.channels.members(channelId),
      });
      handleCloseModal();
    },
    onError: (error: Error) => {
      showFailure({ message: error.message || 'Failed to add member' });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: removeChannelMember,
    onSuccess: () => {
      showSuccess({ message: 'Member removed successfully' });
      queryClient.invalidateQueries({
        queryKey: dashboardQueryKeys.channels.members(channelId),
      });
    },
    onError: (error: Error) => {
      showFailure({ message: error.message || 'Failed to remove member' });
    },
  });

  const handleRemoveMember = (appUserId: string) => {
    removeMemberMutation.mutate({
      data: {
        channelId,
        appUserId,
      },
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
                    <Avatar
                      size="sm"
                      src={
                        user.avatarPath ? `/api/media/${user.avatarPath}` : null
                      }
                    >
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
                    <Avatar
                      size="sm"
                      src={
                        membership.appUser.avatarPath
                          ? `/api/media/${membership.appUser.avatarPath}`
                          : null
                      }
                    >
                      {membership.appUser.username.charAt(0).toUpperCase()}
                    </Avatar>
                    <div>
                      <Text size="sm" fw={500}>
                        {membership.appUser.username}
                        {membership.appUser.id ===
                          channel.userMembership?.appUser.id && (
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
                      channel.userMembership?.appUser.id;
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
