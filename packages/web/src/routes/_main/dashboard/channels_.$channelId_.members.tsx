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

// Drop-in for Mantine's CopyButton: exposes the same `{ copied, copy }`
// render-prop API on top of the shared `useCopied` hook.
function CopyButton({
  value,
  children,
}: {
  value: string;
  children: (args: { copied: boolean; copy: () => void }) => ReactNode;
}) {
  const { copied, copy } = useCopied(1000);
  return <>{children({ copied, copy: () => copy(value) })}</>;
}

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

type ChannelInvitation = {
  id: string;
  email: string;
  isAdmin: boolean;
  canEdit: boolean;
  canUpload: boolean;
  canDownload: boolean;
  createdAt: Date;
  expiresAt: Date;
  token: string;
  invitedBy: {
    username: string;
    fullName: string | null;
  } | null;
};

export const Route = createFileRoute(
  '/_main/dashboard/channels_/$channelId_/members',
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

  const { data: invitations = [] } = useSuspenseQuery(
    trpc.dashboard.channels.getChannelInvitations.queryOptions({
      channelId,
    }),
  );

  const isAdmin = channel.canAdmin ?? false;

  const [
    inviteMemberModalOpened,
    { open: openInviteMemberModal, close: closeInviteMemberModal },
  ] = useDisclosure();

  const form = useAppForm({
    defaultValues: {
      email: '',
      role: 'uploader',
    },
    onSubmit: async ({ value }) => {
      const permissions = {
        isAdmin: value.role === 'admin',
        canEdit: value.role === 'admin' || value.role === 'editor',
        canUpload: value.role !== 'member',
        canDownload: false,
      };

      inviteMemberMutation.mutate({
        channelId,
        email: value.email,
        ...permissions,
      });
    },
  });

  const inviteMemberMutation = useMutation(
    trpc.dashboard.channels.inviteToChannel.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Invitation sent successfully' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelMembers.queryKey({
            channelId,
          }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelInvitations.queryKey({
            channelId,
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

  const cancelInvitationMutation = useMutation(
    trpc.dashboard.channels.cancelChannelInvitation.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Invitation cancelled' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelInvitations.queryKey({
            channelId,
          }),
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
    trpc.dashboard.channels.resendChannelInvitation.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Invitation resent' });
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
      channelId,
      appUserId,
    });
  };

  const handleCancelInvitation = (invitationId: string) => {
    cancelInvitationMutation.mutate({
      channelId,
      invitationId,
    });
  };

  const handleResendInvitation = (invitationId: string) => {
    resendInvitationMutation.mutate({
      channelId,
      invitationId,
    });
  };

  const getRoleLabel = (membership: MembershipWithUser) => {
    if (membership.isAdmin) return 'Admin';
    const roles = [];
    if (membership.canEdit) roles.push('Edit');
    if (membership.canUpload) roles.push('Upload');
    return roles.length > 0 ? roles.join(', ') : 'Member';
  };

  const getInvitationRoleLabel = (invitation: ChannelInvitation) => {
    if (invitation.isAdmin) return 'Admin';
    const roles = [];
    if (invitation.canEdit) roles.push('Edit');
    if (invitation.canUpload) roles.push('Upload');
    return roles.length > 0 ? roles.join(', ') : 'Member';
  };

  const getRoleBadgeColor = (membership: MembershipWithUser) => {
    if (membership.isAdmin) return 'blue';
    if (membership.canEdit) return 'green';
    if (membership.canUpload) return 'yellow';
    return 'gray';
  };

  const getInvitationBadgeColor = (invitation: ChannelInvitation) => {
    if (invitation.isAdmin) return 'blue';
    if (invitation.canEdit) return 'green';
    if (invitation.canUpload) return 'yellow';
    return 'gray';
  };

  const getRoleIcon = (membership: MembershipWithUser) => {
    if (membership.isAdmin) return <IconUserShield size={14} />;
    return <IconUserCheck size={14} />;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title order={1}>Members</Title>
          <Text c="dimmed">
            {channel.name} • {channel.memberships?.length || 0} total members
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
              {invitations.map((invitation: ChannelInvitation) => (
                <Table.Tr key={invitation.id}>
                  <Table.Td>
                    <div className="flex flex-wrap items-center justify-start gap-2.5">
                      <IconMail size={16} />
                      <Text size="sm">{invitation.email}</Text>
                    </div>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={getInvitationBadgeColor(invitation)}
                      size="sm"
                    >
                      {getInvitationRoleLabel(invitation)}
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
                <Text ta="center" c="dimmed" className="py-8">
                  No members found
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            channel.memberships?.map((membership: MembershipWithUser) => (
              <Table.Tr key={`${membership.channelId}-${membership.appUserId}`}>
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
                          channel.userMembership?.appUserId && (
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
                      channel.userMembership?.appUserId;
                    const adminCount =
                      channel.memberships?.filter((m) => m.isAdmin).length || 0;
                    const isLastAdmin =
                      isSelf && membership.isAdmin && adminCount === 1;
                    const canRemove = isAdmin && !isLastAdmin;
                    const tooltipText = !isAdmin
                      ? 'Only admins can remove members'
                      : isLastAdmin
                        ? 'Cannot remove the last admin'
                        : isSelf
                          ? 'Remove yourself from the channel'
                          : 'Remove this member from the channel';

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
                            loading={removeMemberMutation.isPending}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </span>
                      </Tooltip>
                    );
                  })()}
                </Table.Td>
              </Table.Tr>
            ))
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
                          label: 'Editor - Can edit and upload',
                        },
                        {
                          value: 'uploader',
                          label: 'Uploader - Can upload only',
                        },
                        {
                          value: 'member',
                          label: 'Member - View only',
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
