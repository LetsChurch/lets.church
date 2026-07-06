import {
  IconCheck,
  IconLink,
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
import type { ReactNode } from 'react';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Table,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { useAppForm } from '@/components/ui/form';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useCopied } from '@/hooks/use-copied';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

// Drop-in for Mantine's CopyButton render-prop, backed by the shared hook.
function CopyButton({
  value,
  timeout = 1000,
  children,
}: {
  value: string;
  timeout?: number;
  children: (payload: { copied: boolean; copy: () => void }) => ReactNode;
}) {
  const { copied, copy } = useCopied(timeout);
  return <>{children({ copied, copy: () => copy(value) })}</>;
}

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
  token: string;
  invitedBy: {
    username: string;
    fullName: string | null;
  } | null;
};

export const Route = createFileRoute(
  '/_main/dashboard/organizations_/$orgId_/members',
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

  const form = useAppForm({
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
        queryClient.invalidateQueries(
          trpc.dashboard.organizations.pathFilter(),
        );
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
        queryClient.invalidateQueries(
          trpc.dashboard.organizations.pathFilter(),
        );
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
        queryClient.invalidateQueries(
          trpc.dashboard.organizations.pathFilter(),
        );
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
        queryClient.invalidateQueries(
          trpc.dashboard.organizations.pathFilter(),
        );
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <Title order={1}>Members</Title>
        {isAdmin && (
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openInviteMemberModal}
          >
            Send Invitation
          </Button>
        )}
      </div>

      {/* Pending Invitations Section */}
      {isAdmin && invitations.length > 0 && (
        <>
          <Title order={3} className="mb-4">
            Pending Invitations
          </Title>
          <Table className="mb-8">
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
                    <div className="flex flex-wrap items-center justify-start gap-2.5">
                      <IconMail size={16} />
                      <Text size="sm">{invitation.email}</Text>
                    </div>
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
                      {invitation.invitedBy?.fullName ||
                        invitation.invitedBy?.username ||
                        'An administrator'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(invitation.expiresAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <div className="flex flex-wrap items-center justify-start gap-2.5">
                      <CopyButton
                        value={`${typeof window !== 'undefined' ? window.location.origin : 'https://lets.church'}/dashboard/invitations/accept?token=${invitation.token}`}
                      >
                        {({ copied, copy }) => (
                          <Tooltip
                            label={copied ? 'Copied!' : 'Copy Invite Link'}
                          >
                            <ActionIcon
                              color={copied ? 'green' : 'blue'}
                              variant="subtle"
                              onClick={copy}
                            >
                              {copied ? (
                                <IconCheck size={16} />
                              ) : (
                                <IconLink size={16} />
                              )}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
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
                    </div>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <hr className="my-8" />
        </>
      )}

      {/* Active Members Section */}
      <Title order={3} className="mb-4">
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
                  <div className="flex flex-wrap items-center justify-start gap-3">
                    <Avatar
                      src={membership.appUser.avatarUrl}
                      alt={
                        membership.appUser.fullName ||
                        membership.appUser.username
                      }
                      className="size-8"
                    />
                    <div>
                      <Text fw={500} size="sm">
                        {membership.appUser.fullName ||
                          membership.appUser.username}
                      </Text>
                      <Text size="xs" c="dimmed">
                        @{membership.appUser.username}
                      </Text>
                    </div>
                  </div>
                </Table.Td>
                <Table.Td>
                  <div className="flex flex-wrap items-center justify-start gap-2.5">
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
                  </div>
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

      <LcModal.Root
        open={inviteMemberModalOpened}
        onOpenChange={(o) => {
          if (!o) {
            closeInviteMemberModal();
            form.reset();
          }
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Send Invitation" />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <div className="flex flex-col gap-4">
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

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      closeInviteMemberModal();
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={inviteMemberMutation.isPending}
                  >
                    Send Invitation
                  </Button>
                </div>
              </div>
            </form>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>
    </>
  );
}
