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

type OrganizationMembershipWithUser = {
  organizationId: string;
  appUserId: string;
  isAdmin: boolean;
  canEdit: boolean;
  createdAt: Date;
  appUser: {
    id: string;
    username: string;
    fullName: string | null;
    avatarPath: string | null;
  };
};

export const Route = createFileRoute(
  '/dashboard_/churches_/$churchId_/members',
)({
  component: ChurchMembersPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    const data = await queryClient.ensureQueryData(
      trpc.dashboard.churches.getChurchMembers.queryOptions({
        churchId: params.churchId,
      }),
    );
    return {
      backNavigation: {
        label: data.name,
        to: '/dashboard/churches/$churchId',
        params: { churchId: params.churchId },
      },
    };
  },
});

function ChurchMembersPage() {
  const { churchId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: church } = useSuspenseQuery(
    trpc.dashboard.churches.getChurchMembers.queryOptions({
      churchId,
    }),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 200);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const isAdmin = church.userMembership?.isAdmin ?? false;

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
      role: 'member',
    },
    onSubmit: async ({ value }) => {
      if (!selectedUserId) return;

      const permissions = {
        isAdmin: value.role === 'admin',
        canEdit: value.role === 'admin' || value.role === 'editor',
      };

      addMemberMutation.mutate({
        churchId,
        userId: selectedUserId,
        ...permissions,
      });
    },
  });

  const { data: searchResults = [] } = useQuery({
    ...trpc.dashboard.churches.searchUsers.queryOptions({
      churchId,
      query: debouncedSearchQuery,
    }),
    enabled: debouncedSearchQuery.length >= 2,
    staleTime: 30000,
  });

  const addMemberMutation = useMutation(
    trpc.dashboard.churches.addChurchMember.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Member added successfully' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurchMembers.queryKey({
            churchId,
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
    trpc.dashboard.churches.removeChurchMember.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Member removed successfully' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurchMembers.queryKey({
            churchId,
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
      churchId,
      appUserId,
    });
  };

  const getRoleLabel = (membership: OrganizationMembershipWithUser) => {
    if (membership.isAdmin) return 'Admin';
    if (membership.canEdit) return 'Editor';
    return 'Member';
  };

  const getRoleBadgeColor = (membership: OrganizationMembershipWithUser) => {
    if (membership.isAdmin) return 'blue';
    if (membership.canEdit) return 'green';
    return 'gray';
  };

  const getRoleIcon = (membership: OrganizationMembershipWithUser) => {
    if (membership.isAdmin) return <IconUserShield size={14} />;
    return <IconUserCheck size={14} />;
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1}>Members</Title>
          <Text c="dimmed">
            {church.name} • {church.memberships?.length || 0} total members
          </Text>
        </div>

        <Tooltip
          label={
            isAdmin
              ? 'Add a new member to this church'
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
        title="Add Church Member"
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
                        label: 'Editor - Can edit church content',
                      },
                      {
                        value: 'member',
                        label: 'Member - Basic access',
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
          {church.memberships?.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text ta="center" c="dimmed" py="xl">
                  No members found
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            church.memberships?.map(
              (membership: OrganizationMembershipWithUser) => (
                <Table.Tr
                  key={`${membership.organizationId}-${membership.appUserId}`}
                >
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
                            church.userMembership?.appUserId && (
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
                        church.userMembership?.appUserId;
                      const canRemove = isAdmin && !isSelf;
                      const tooltipText = !isAdmin
                        ? 'Only admins can remove members'
                        : isSelf
                          ? 'You cannot remove yourself'
                          : 'Remove this member from the church';

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
              ),
            )
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
