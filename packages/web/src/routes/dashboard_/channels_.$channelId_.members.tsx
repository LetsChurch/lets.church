import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  CopyButton,
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

  const form = useAppMantineForm({
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
      </Group>

      {/* Pending Invitations Section */}
      {isAdmin && invitations.length > 0 && (
        <>
          <Title order={3} mb="md">
            Pending Invitations
          </Title>
          <Table verticalSpacing="md">
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
                    <Group gap="xs">
                      <IconMail size={16} />
                      <Text size="sm">{invitation.email}</Text>
                    </Group>
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
                      {invitation.invitedBy.fullName ||
                        invitation.invitedBy.username}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(invitation.expiresAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
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

      <Modal
        opened={inviteMemberModalOpened}
        onClose={() => {
          closeInviteMemberModal();
          form.reset();
        }}
        title="Send Invitation"
        size="md"
        centered
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <Stack gap="md">
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

            <Group justify="flex-end" mt="md">
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
    </Stack>
  );
}
