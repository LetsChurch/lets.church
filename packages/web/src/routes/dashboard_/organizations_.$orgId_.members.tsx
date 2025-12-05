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
import { showFailure, showSuccess } from '@/routes/-mantine';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

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
    avatarUrl: string | null;
  };
};

export const Route = createFileRoute(
  '/dashboard_/organizations_/$orgId_/members',
)({
  component: OrganizationMembersPage,
  beforeLoad: async ({ context, params }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }

    // Check if user has access to this organization (either member or site admin)
    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );

    // Site admins can access any organization
    if (currentUser.role === 'ADMIN') {
      return { isSiteAdmin: true };
    }

    // Check if user is a member of this organization
    try {
      await context.queryClient.ensureQueryData(
        context.trpc.dashboard.organizations.getOrganizationMembers.queryOptions(
          {
            orgId: params.orgId,
          },
        ),
      );
      return { isSiteAdmin: false };
    } catch (_error) {
      // If user is not a member and not an admin, redirect
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    const data = await queryClient.ensureQueryData(
      trpc.dashboard.organizations.getOrganizationMembers.queryOptions({
        orgId: params.orgId,
      }),
    );
    return {
      backNavigation: {
        label: data.name,
        to: '/dashboard/organizations/$orgId',
        params: { orgId: params.orgId },
      },
    };
  },
});

function OrganizationMembersPage() {
  const { orgId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isSiteAdmin } = Route.useRouteContext() as { isSiteAdmin: boolean };

  const { data: organization } = useSuspenseQuery(
    trpc.dashboard.organizations.getOrganizationMembers.queryOptions({
      orgId,
    }),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 200);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const isAdmin = organization.userMembership?.isAdmin ?? isSiteAdmin;

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
        orgId,
        userId: selectedUserId,
        ...permissions,
      });
    },
  });

  const { data: searchResults = [] } = useQuery({
    ...trpc.dashboard.organizations.searchUsers.queryOptions({
      orgId,
      query: debouncedSearchQuery,
    }),
    enabled: debouncedSearchQuery.length >= 2,
    staleTime: 30000,
  });

  const addMemberMutation = useMutation(
    trpc.dashboard.organizations.addOrganizationMember.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'User added successfully' });
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'organizations'],
        });
        handleCloseModal();
      },
      onError: (error) => {
        showFailure({ message: error.message || 'Failed to add user' });
      },
    }),
  );

  const removeMemberMutation = useMutation(
    trpc.dashboard.organizations.removeOrganizationMember.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'User removed successfully' });
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'organizations'],
        });
      },
      onError: (error) => {
        showFailure({ message: error.message || 'Failed to remove user' });
      },
    }),
  );

  const handleRemoveMember = (appUserId: string) => {
    removeMemberMutation.mutate({
      orgId,
      appUserId,
    });
  };

  return (
    <>
      <Group justify="space-between" align="center" mb="lg">
        <Title order={1}>Users</Title>
        {isAdmin && (
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openAddMemberModal}
          >
            Add User
          </Button>
        )}
      </Group>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>User</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Joined</Table.Th>
            {isAdmin && <Table.Th>Actions</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {organization.memberships.map(
            (membership: OrganizationMembershipWithUser) => (
              <Table.Tr key={membership.appUserId}>
                <Table.Td>
                  <Group gap="sm">
                    <Avatar
                      src={membership.appUser.avatarUrl}
                      alt={
                        membership.appUser.fullName ||
                        membership.appUser.username
                      }
                      size="sm"
                    >
                      {(
                        membership.appUser.fullName ||
                        membership.appUser.username
                      )
                        .charAt(0)
                        .toUpperCase()}
                    </Avatar>
                    <div>
                      <Text fw={500} size="sm">
                        {membership.appUser.fullName ||
                          membership.appUser.username}
                      </Text>
                      <Text size="xs" c="dimmed">
                        @{membership.appUser.username}
                      </Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {membership.isAdmin ? (
                      <Badge
                        color="blue"
                        leftSection={<IconUserShield size={12} />}
                      >
                        Admin
                      </Badge>
                    ) : membership.canEdit ? (
                      <Badge
                        color="green"
                        leftSection={<IconUserCheck size={12} />}
                      >
                        Editor
                      </Badge>
                    ) : (
                      <Badge
                        color="gray"
                        leftSection={<IconUserCheck size={12} />}
                      >
                        User
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatDate(membership.createdAt)}</Text>
                </Table.Td>
                {isAdmin && (
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip label="Remove User">
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          onClick={() =>
                            handleRemoveMember(membership.appUserId)
                          }
                          loading={removeMemberMutation.isPending}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                )}
              </Table.Tr>
            ),
          )}
        </Table.Tbody>
      </Table>

      <Modal
        opened={addMemberModalOpened}
        onClose={handleCloseModal}
        title="Add User"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <Stack>
            <TextInput
              label="Search Users"
              placeholder="Enter username to search..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
            />

            {searchResults.length > 0 && (
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Search Results:
                </Text>
                {searchResults.map((user) => (
                  <Group
                    key={user.id}
                    p="xs"
                    style={{
                      border:
                        selectedUserId === user.id
                          ? '2px solid var(--mantine-color-blue-6)'
                          : '1px solid var(--mantine-color-gray-3)',
                      borderRadius: 'var(--mantine-radius-sm)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    <Avatar
                      src={user.avatarUrl}
                      alt={user.fullName || user.username}
                      size="sm"
                    >
                      {(user.fullName || user.username).charAt(0).toUpperCase()}
                    </Avatar>
                    <div>
                      <Text fw={500} size="sm">
                        {user.fullName || user.username}
                      </Text>
                      <Text size="xs" c="dimmed">
                        @{user.username}
                      </Text>
                    </div>
                  </Group>
                ))}
              </Stack>
            )}

            {selectedUserId && (
              <form.AppField name="role">
                {(field) => (
                  <field.SelectField
                    label="Role"
                    data={[
                      { value: 'member', label: 'User' },
                      { value: 'editor', label: 'Editor' },
                      { value: 'admin', label: 'Admin' },
                    ]}
                  />
                )}
              </form.AppField>
            )}

            <Group justify="flex-end" gap="sm">
              <Button variant="outline" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedUserId}
                loading={addMemberMutation.isPending}
              >
                Add User
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
