import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/dashboard_/invitations')({
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
      <div className="container mx-auto max-w-4xl p-4">
        <Title order={2} mb="lg">
          Pending Invitations
        </Title>
        <Text c="dimmed">Loading...</Text>
      </div>
    );
  }

  if (!invitations || invitations.length === 0) {
    return (
      <div className="container mx-auto max-w-4xl p-4">
        <Title order={2} mb="lg">
          Pending Invitations
        </Title>
        <Alert icon={<IconInfoCircle />} color="blue">
          You have no pending invitations.
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl p-4">
      <Title order={2} mb="lg">
        Pending Invitations
      </Title>

      <Stack gap="md">
        {invitations.map((invitation) => (
          <Card key={invitation.token} shadow="sm" padding="lg" withBorder>
            <Group justify="space-between" mb="md">
              <div>
                <Group gap="xs" mb="xs">
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
                </Group>
                <Text size="sm" c="dimmed">
                  Invited{' '}
                  {formatDistanceToNow(invitation.createdAt, {
                    addSuffix: true,
                  })}
                </Text>
              </div>
            </Group>

            <Group gap="sm">
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
            </Group>
          </Card>
        ))}
      </Stack>
    </div>
  );
}
