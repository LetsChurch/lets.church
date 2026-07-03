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
import { useState } from 'react';
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

type ChurchInvitation = {
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

function CopyInviteButton({ value }: { value: string }) {
  const { copied, copy } = useCopied(1000);

  return (
    <Tooltip label={copied ? 'Copied!' : 'Copy Invite Link'}>
      <ActionIcon
        color={copied ? 'green' : 'blue'}
        variant="subtle"
        onClick={() => copy(value)}
      >
        {copied ? <IconCheck size={16} /> : <IconLink size={16} />}
      </ActionIcon>
    </Tooltip>
  );
}

export const Route = createFileRoute(
  '/_main/dashboard/churches_/$churchId_/members',
)({
  component: ChurchMembersPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
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

  const { data: invitations = [] } = useSuspenseQuery(
    trpc.dashboard.churches.getChurchInvitations.queryOptions({
      churchId,
    }),
  );

  const isAdmin = church.userMembership?.isAdmin ?? false;

  const [pendingResendId, setPendingResendId] = useState<string | null>(null);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

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
        churchId,
        email: value.email,
        isAdmin: value.role === 'admin',
        canEdit: value.role === 'admin' || value.role === 'editor',
      });
    },
  });

  const inviteMemberMutation = useMutation(
    trpc.dashboard.churches.inviteToChurch.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Invitation sent successfully' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurchMembers.queryKey({
            churchId,
          }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurchInvitations.queryKey({
            churchId,
          }),
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
    trpc.dashboard.churches.removeChurchMember.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'User removed successfully' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurchMembers.queryKey({
            churchId,
          }),
        });
      },
      onError: (error) => {
        showFailure({ message: error.message || 'Failed to remove user' });
      },
      onSettled: () => {
        setPendingRemoveId(null);
      },
    }),
  );

  const cancelInvitationMutation = useMutation(
    trpc.dashboard.churches.cancelChurchInvitation.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Invitation cancelled' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurchInvitations.queryKey({
            churchId,
          }),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to cancel invitation',
        });
      },
      onSettled: () => {
        setPendingCancelId(null);
      },
    }),
  );

  const resendInvitationMutation = useMutation(
    trpc.dashboard.churches.resendChurchInvitation.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Invitation resent' });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to resend invitation',
        });
      },
      onSettled: () => {
        setPendingResendId(null);
      },
    }),
  );

  const handleRemoveMember = (appUserId: string) => {
    setPendingRemoveId(appUserId);
    removeMemberMutation.mutate({
      churchId,
      appUserId,
    });
  };

  const handleCancelInvitation = (invitationId: string) => {
    setPendingCancelId(invitationId);
    cancelInvitationMutation.mutate({
      churchId,
      invitationId,
    });
  };

  const handleResendInvitation = (invitationId: string) => {
    setPendingResendId(invitationId);
    resendInvitationMutation.mutate({
      churchId,
      invitationId,
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title order={1}>Members</Title>
          <Text c="dimmed">
            {church.name} • {church.memberships?.length || 0} total members
          </Text>
        </div>

        <Tooltip
          label={
            isAdmin
              ? 'Send invitation to new member'
              : 'Only admins can send invitations'
          }
          disabled={isAdmin}
        >
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openInviteMemberModal}
            disabled={!isAdmin}
          >
            Send Invitation
          </Button>
        </Tooltip>
      </div>

      {/* Pending Invitations Section */}
      {isAdmin && invitations.length > 0 && (
        <>
          <Title order={3} className="mb-4">
            Pending Invitations
          </Title>
          <Table>
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
              {invitations.map((invitation: ChurchInvitation) => (
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
                      size="sm"
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
                      <CopyInviteButton
                        value={`${typeof window !== 'undefined' ? window.location.origin : 'https://lets.church'}/dashboard/invitations/accept?token=${invitation.token}`}
                      />
                      <Tooltip label="Resend Invitation">
                        <ActionIcon
                          color="blue"
                          variant="subtle"
                          onClick={() => handleResendInvitation(invitation.id)}
                          loading={pendingResendId === invitation.id}
                        >
                          <IconRefresh size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Cancel Invitation">
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          onClick={() => handleCancelInvitation(invitation.id)}
                          loading={pendingCancelId === invitation.id}
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
                <Text ta="center" c="dimmed" className="py-8">
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
                    <div className="flex flex-wrap items-center justify-start gap-3">
                      <Avatar
                        src={membership.appUser.avatarUrl}
                        alt={membership.appUser.username}
                        className="size-8"
                      />
                      <div>
                        <Text size="sm" fw={500}>
                          {membership.appUser.username}
                          {membership.appUser.id ===
                            church.userMembership?.appUserId && (
                            <Text
                              component="span"
                              size="xs"
                              c="dimmed"
                              className="ml-[4px]"
                            >
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
                    </div>
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
                      const adminCount =
                        church.memberships?.filter((m) => m.isAdmin).length ||
                        0;
                      const isLastAdmin =
                        isSelf && membership.isAdmin && adminCount === 1;
                      const canRemove = isAdmin && !isLastAdmin;
                      const tooltipText = !isAdmin
                        ? 'Only admins can remove members'
                        : isLastAdmin
                          ? 'Cannot remove the last admin'
                          : isSelf
                            ? 'Remove yourself from the church'
                            : 'Remove this member from the church';

                      return (
                        <Tooltip label={tooltipText}>
                          <span style={{ display: 'inline-block' }}>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size="sm"
                              disabled={!canRemove}
                              onClick={() =>
                                canRemove &&
                                handleRemoveMember(membership.appUserId)
                              }
                              loading={pendingRemoveId === membership.appUserId}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </span>
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

                <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
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
    </div>
  );
}
