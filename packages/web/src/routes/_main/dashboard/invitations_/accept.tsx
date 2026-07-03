import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Alert, Badge, Button, Text, Title } from '@/components/ui';
import { showFailure } from '@/components/ui/notifications';
import { IncomingIdSchema } from '@/schemas/common';
import { useTRPC } from '@/trpc/react';

const searchSchema = z.object({
  token: IncomingIdSchema,
});

export const Route = createFileRoute('/_main/dashboard/invitations_/accept')({
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
        <Title order={2} className="mb-5">
          Loading Invitation...
        </Title>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="container mx-auto max-w-2xl p-4">
        <Title order={2} className="mb-5">
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
        <Title order={2} className="mb-5">
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
      <Title order={2} className="mb-5">
        Invitation to{' '}
        {invitation.type === 'organization' ? 'Organization' : 'Channel'}
      </Title>

      <div className="overflow-hidden rounded-xl border-fancy-pants bg-white p-5 shadow-sm dark:bg-zinc-900">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-start gap-4">
            <Text fw={500} size="xl">
              {entityName}
            </Text>
            <Badge
              color={invitation.type === 'organization' ? 'blue' : 'green'}
            >
              {invitation.type === 'organization' ? 'Organization' : 'Channel'}
            </Badge>
          </div>

          {permissions.length > 0 && (
            <div>
              <Text size="sm" fw={500} className="mb-2.5">
                Permissions:
              </Text>
              <div className="flex flex-wrap items-center justify-start gap-2.5">
                {permissions.map((permission) => (
                  <Badge key={permission} variant="light">
                    {permission}
                  </Badge>
                ))}
              </div>
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
              <div className="flex flex-col gap-2.5">
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
              </div>
            </Alert>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-start gap-3">
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
          </div>
        </div>
      </div>
    </div>
  );
}
