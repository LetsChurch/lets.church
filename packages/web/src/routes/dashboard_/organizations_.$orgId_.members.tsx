import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconMail,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUserCheck,
  IconUserShield,
  IconX,
} from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
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

type OrganizationInvitation = {
  id: string;
  email: string;
  isAdmin: boolean;
  canEdit: boolean;
  createdAt: Date;
  expiresAt: Date;
  invitedBy: {
    username: string;
    fullName: string | null;
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

  const { data: organization } = useSuspenseQuery(
    trpc.dashboard.organizations.getOrganizationMembers.queryOptions({
      orgId,
    }),
  );

  const { data: invitations = [] } = useSuspenseQuery(
    trpc.dashboard.organizations.getOrganizationInvitations.queryOptions({
      orgId,
    }),
  );

  const isAdmin = organization.canAdmin ?? false;

  const [
    inviteMemberModalOpened,
    { open: openInviteMemberModal, close: closeInviteMemberModal },
  ] = useDisclosure();

  const form = useAppMantineForm({
    defaultValues: {
      email: '',
      role: 'member',
    },
    onSubmit: async ({ value }) => {
      inviteMemberMutation.mutate({
        orgId,
        email: value.email,
        isAdmin: value.role === 'admin',
        canEdit: value.role === 'admin' || value.role === 'editor',
      });
    },
  });

  const inviteMemberMutation = useMutation(
    trpc.dashboard.organizations.inviteToOrganization.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Invitation sent successfully' });
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'organizations'],
        });
        closeInviteMemberModal();
        form.reset();
      },
      onError: (error) => {
        showFailure({ message: error.message || 'Failed to send invitation' });
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

  const cancelInvitationMutation = useMutation(
    trpc.dashboard.organizations.cancelInvitation.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Invitation cancelled' });
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'organizations'],
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to cancel invitation',
        });
      },
    }),
  );

  const resendInvitationMutation = useMutation(
    trpc.dashboard.organizations.resendInvitation.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Invitation resent' });
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'organizations'],
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to resend invitation',
        });
      },
    }),
  );

  const handleRemoveMember = (appUserId: string) => {
    removeMemberMutation.mutate({
      orgId,
      appUserId,
    });
  };

  const handleCancelInvitation = (invitationId: string) => {
    cancelInvitationMutation.mutate({
      orgId,
      invitationId,
    });
  };

  const handleResendInvitation = (invitationId: string) => {
    resendInvitationMutation.mutate({
      orgId,
      invitationId,
    });
  };

  return (
    <>
      <Group justify="space-between" align="center" mb="lg">
        <Title order={1}>Members</Title>
        {isAdmin && (
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openInviteMemberModal}
          >
            Send Invitation
          </Button>
        )}
      </Group>

      {/* Pending Invitations Section */}
      {isAdmin && invitations.length > 0 && (
        <>
          <Title order={3} mb="md">
            Pending Invitations
          </Title>
          <Table mb="xl">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Email</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Invited By</Table.Th>
                <Table.Th>Expires</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {invitations.map((invitation: OrganizationInvitation) => (
                <Table.Tr key={invitation.id}>
                  <Table.Td>
                    <Group gap="xs">
                      <IconMail size={16} />
                      <Text size="sm">{invitation.email}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={
                        invitation.isAdmin
                          ? 'blue'
                          : invitation.canEdit
                            ? 'green'
                            : 'gray'
                      }
                    >
                      {invitation.isAdmin
                        ? 'Admin'
                        : invitation.canEdit
                          ? 'Editor'
                          : 'Member'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {invitation.invitedBy.fullName ||
                        invitation.invitedBy.username}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(invitation.expiresAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip label="Resend Invitation">
                        <ActionIcon
                          color="blue"
                          variant="subtle"
                          onClick={() => handleResendInvitation(invitation.id)}
                          loading={resendInvitationMutation.isPending}
                        >
                          <IconRefresh size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Cancel Invitation">
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          onClick={() => handleCancelInvitation(invitation.id)}
                          loading={cancelInvitationMutation.isPending}
                        >
                          <IconX size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Divider my="xl" />
        </>
      )}

      {/* Active Members Section */}
      <Title order={3} mb="md">
        Active Members
      </Title>
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
                        Member
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatDate(membership.createdAt)}</Text>
                </Table.Td>
                {isAdmin && (
                  <Table.Td>
                    {(() => {
                      const isSelf =
                        membership.appUser.id ===
                        organization.userMembership?.appUserId;
                      const adminCount =
                        organization.memberships.filter((m) => m.isAdmin)
                          .length || 0;
                      const isLastAdmin =
                        isSelf && membership.isAdmin && adminCount === 1;
                      const canRemove = !isLastAdmin;
                      const tooltipText = isLastAdmin
                        ? 'Cannot remove the last admin'
                        : isSelf
                          ? 'Remove yourself from the organization'
                          : 'Remove this member from the organization';

                      return (
                        <Tooltip label={tooltipText}>
                          <span style={{ display: 'inline-block' }}>
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              disabled={!canRemove}
                              onClick={() =>
                                canRemove &&
                                handleRemoveMember(membership.appUserId)
                              }
                              loading={removeMemberMutation.isPending}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </span>
                        </Tooltip>
                      );
                    })()}
                  </Table.Td>
                )}
              </Table.Tr>
            ),
          )}
        </Table.Tbody>
      </Table>

      <Modal
        opened={inviteMemberModalOpened}
        onClose={() => {
          closeInviteMemberModal();
          form.reset();
        }}
        title="Send Invitation"
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
            <form.AppField name="email">
              {(field) => (
                <field.TextInputField
                  label="Email Address"
                  placeholder="user@example.com"
                  type="email"
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="role">
              {(field) => (
                <field.SelectField
                  label="Role"
                  data={[
                    { value: 'member', label: 'Member' },
                    { value: 'editor', label: 'Editor' },
                    { value: 'admin', label: 'Admin' },
                  ]}
                />
              )}
            </form.AppField>

            <Group justify="flex-end" gap="sm">
              <Button
                variant="outline"
                onClick={() => {
                  closeInviteMemberModal();
                  form.reset();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={inviteMemberMutation.isPending}>
                Send Invitation
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
