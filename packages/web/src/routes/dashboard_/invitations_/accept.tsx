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
import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { IncomingIdSchema } from '@/schemas/common';
import { useTRPC } from '@/trpc/react';
import { showFailure } from '../../-mantine';

const searchSchema = z.object({
  token: IncomingIdSchema,
});

export const Route = createFileRoute('/dashboard_/invitations_/accept')({
  component: AcceptInvitationRoute,
  validateSearch: searchSchema,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
});

function AcceptInvitationRoute() {
  const { token } = Route.useSearch();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [verificationError, setVerificationError] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const resendMutation = useMutation(
    trpc.common.resendVerificationEmail.mutationOptions({
      onSuccess: () => {
        setResendSuccess(true);
        timeoutRef.current = setTimeout(() => setResendSuccess(false), 5000);
      },
    }),
  );

  const { data: invitation, isLoading } = useQuery(
    trpc.common.getInvitationDetails.queryOptions({ token }),
  );

  const acceptOrgMutation = useMutation(
    trpc.common.acceptOrganizationInvitation.mutationOptions({
      onSuccess: async (result) => {
        // Invalidate pending invitations
        await queryClient.invalidateQueries({
          queryKey: trpc.common.getPendingInvitations.queryKey(),
        });

        if ('declined' in result && result.declined) {
          await navigate({ to: '/dashboard/invitations' });
        } else if ('organizationId' in result && result.organizationId) {
          // Navigate to the organization
          await navigate({
            to: '/dashboard/organizations/$orgId',
            params: { orgId: result.organizationId },
          });
        } else {
          await navigate({ to: '/dashboard/invitations' });
        }
      },
      onError: (error) => {
        if (
          error.message === 'You must verify the invited email address first'
        ) {
          setVerificationError(true);
        } else {
          showFailure({
            message: error.message || 'Failed to process invitation',
          });
        }
      },
    }),
  );

  const acceptChannelMutation = useMutation(
    trpc.common.acceptChannelInvitation.mutationOptions({
      onSuccess: async (result) => {
        // Invalidate pending invitations
        await queryClient.invalidateQueries({
          queryKey: trpc.common.getPendingInvitations.queryKey(),
        });

        if ('declined' in result && result.declined) {
          await navigate({ to: '/dashboard/invitations' });
        } else if ('channelId' in result && result.channelId) {
          // Navigate to the channel
          await navigate({
            to: '/dashboard/channels/$channelId',
            params: { channelId: result.channelId },
          });
        } else {
          await navigate({ to: '/dashboard/invitations' });
        }
      },
      onError: (error) => {
        if (
          error.message === 'You must verify the invited email address first'
        ) {
          setVerificationError(true);
        } else {
          showFailure({
            message: error.message || 'Failed to process invitation',
          });
        }
      },
    }),
  );

  const handleAccept = () => {
    if (!invitation) return;

    if (invitation.type === 'organization') {
      acceptOrgMutation.mutate({ token, accept: true });
    } else if (invitation.type === 'channel') {
      acceptChannelMutation.mutate({ token, accept: true });
    }
  };

  const handleDecline = () => {
    if (!invitation) return;

    if (invitation.type === 'organization') {
      acceptOrgMutation.mutate({ token, accept: false });
    } else if (invitation.type === 'channel') {
      acceptChannelMutation.mutate({ token, accept: false });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-2xl p-4">
        <Title order={2} mb="lg">
          Loading Invitation...
        </Title>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="container mx-auto max-w-2xl p-4">
        <Title order={2} mb="lg">
          Invitation Not Found
        </Title>
        <Alert icon={<IconInfoCircle />} color="red">
          This invitation could not be found. It may have expired or been
          cancelled.
        </Alert>
      </div>
    );
  }

  if (invitation.status !== 'PENDING') {
    return (
      <div className="container mx-auto max-w-2xl p-4">
        <Title order={2} mb="lg">
          Invitation Already Processed
        </Title>
        <Alert icon={<IconInfoCircle />} color="yellow">
          This invitation has already been {invitation.status.toLowerCase()}.
        </Alert>
      </div>
    );
  }

  const entityName =
    invitation.type === 'organization'
      ? invitation.organization.name
      : invitation.channel.name;

  const permissions: string[] = [];
  if (invitation.isAdmin) {
    permissions.push('Admin');
  }
  if (invitation.canEdit) {
    permissions.push('Editor');
  }
  if (invitation.type === 'channel') {
    if (invitation.canUpload) {
      permissions.push('Can Upload');
    }
    if (invitation.canDownload) {
      permissions.push('Can Download');
    }
  }

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Title order={2} mb="lg">
        Invitation to{' '}
        {invitation.type === 'organization' ? 'Organization' : 'Channel'}
      </Title>

      <Card shadow="sm" padding="lg" withBorder>
        <Stack gap="md">
          <Group>
            <Text fw={500} size="xl">
              {entityName}
            </Text>
            <Badge
              color={invitation.type === 'organization' ? 'blue' : 'green'}
            >
              {invitation.type === 'organization' ? 'Organization' : 'Channel'}
            </Badge>
          </Group>

          {permissions.length > 0 && (
            <div>
              <Text size="sm" fw={500} mb="xs">
                Permissions:
              </Text>
              <Group gap="xs">
                {permissions.map((permission) => (
                  <Badge key={permission} variant="light">
                    {permission}
                  </Badge>
                ))}
              </Group>
            </div>
          )}

          <Text size="sm" c="dimmed">
            You've been invited to join this{' '}
            {invitation.type === 'organization' ? 'organization' : 'channel'}.
            Would you like to accept?
          </Text>

          {verificationError && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Email Verification Required"
              color="red"
            >
              <Stack gap="xs">
                <Text size="sm">
                  You must verify the invited email address first.
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  onClick={() => resendMutation.mutate()}
                  loading={resendMutation.isPending}
                  disabled={resendSuccess}
                >
                  {resendSuccess ? 'Email Sent' : 'Resend Verification Email'}
                </Button>
              </Stack>
            </Alert>
          )}

          <Group gap="sm" mt="md">
            <Button
              onClick={handleAccept}
              loading={
                acceptOrgMutation.isPending || acceptChannelMutation.isPending
              }
              color="blue"
            >
              Accept Invitation
            </Button>
            <Button
              onClick={handleDecline}
              loading={
                acceptOrgMutation.isPending || acceptChannelMutation.isPending
              }
              variant="outline"
              color="red"
            >
              Decline
            </Button>
          </Group>
        </Stack>
      </Card>
    </div>
  );
}
