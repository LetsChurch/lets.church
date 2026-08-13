import { IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';

import { Alert, Badge, Button, Text, Title } from '@/components/ui';
import { notifications } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/dashboard/invitations')({
  component: InvitationsRoute,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
});

function InvitationsRoute() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: invitations, isLoading } = useQuery(
    trpc.common.getPendingInvitations.queryOptions(),
  );

  const acceptOrgMutation = useMutation(
    trpc.common.acceptOrganizationInvitation.mutationOptions({
      onSuccess: () => {
        // Refetch invitations to update the list
        queryClient.invalidateQueries({
          queryKey: trpc.common.getPendingInvitations.queryKey(),
        });
      },
      onError: (error) => {
        notifications.show({
          title: 'Error',
          message: error.message || 'Failed to process organization invitation',
          color: 'red',
        });
        // Refetch to ensure UI is in sync
        queryClient.invalidateQueries({
          queryKey: trpc.common.getPendingInvitations.queryKey(),
        });
      },
    }),
  );

  const acceptChannelMutation = useMutation(
    trpc.common.acceptChannelInvitation.mutationOptions({
      onSuccess: () => {
        // Refetch invitations to update the list
        queryClient.invalidateQueries({
          queryKey: trpc.common.getPendingInvitations.queryKey(),
        });
      },
      onError: (error) => {
        notifications.show({
          title: 'Error',
          message: error.message || 'Failed to process channel invitation',
          color: 'red',
        });
        // Refetch to ensure UI is in sync
        queryClient.invalidateQueries({
          queryKey: trpc.common.getPendingInvitations.queryKey(),
        });
      },
    }),
  );

  const handleAccept = (
    invitation: NonNullable<typeof invitations>[number],
  ) => {
    if (invitation.type === 'organization') {
      acceptOrgMutation.mutate({ token: invitation.token, accept: true });
    } else {
      acceptChannelMutation.mutate({ token: invitation.token, accept: true });
    }
  };

  const handleDecline = (
    invitation: NonNullable<typeof invitations>[number],
  ) => {
    if (invitation.type === 'organization') {
      acceptOrgMutation.mutate({ token: invitation.token, accept: false });
    } else {
      acceptChannelMutation.mutate({ token: invitation.token, accept: false });
    }
  };

  if (isLoading) {
    return (
      <div className="w-full">
        <Title order={2} className="mb-5">
          Pending Invitations
        </Title>
        <Text c="dimmed">Loading...</Text>
      </div>
    );
  }

  if (!invitations || invitations.length === 0) {
    return (
      <div className="w-full">
        <Title order={2} className="mb-5">
          Pending Invitations
        </Title>
        <Alert icon={<IconInfoCircle />} color="blue">
          You have no pending invitations.
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Title order={2} className="mb-5">
        Pending Invitations
      </Title>

      <div className="flex flex-col gap-4">
        {invitations.map((invitation) => (
          <div
            key={invitation.token}
            className="border-fancy-pants overflow-hidden rounded-xl bg-white p-5 shadow-sm dark:bg-zinc-900"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="mb-2.5 flex flex-wrap items-center justify-start gap-2.5">
                  <Text fw={500} size="lg">
                    {invitation.name}
                  </Text>
                  <Badge
                    color={
                      invitation.type === 'organization' ? 'blue' : 'green'
                    }
                  >
                    {invitation.type === 'organization'
                      ? 'Organization'
                      : 'Channel'}
                  </Badge>
                </div>
                <Text size="sm" c="dimmed">
                  Invited{' '}
                  {formatDistanceToNow(invitation.createdAt, {
                    addSuffix: true,
                  })}
                </Text>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-3">
              <Button
                onClick={() => handleAccept(invitation)}
                loading={
                  acceptOrgMutation.isPending || acceptChannelMutation.isPending
                }
                color="blue"
              >
                Accept
              </Button>
              <Button
                onClick={() => handleDecline(invitation)}
                loading={
                  acceptOrgMutation.isPending || acceptChannelMutation.isPending
                }
                variant="outline"
                color="red"
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
