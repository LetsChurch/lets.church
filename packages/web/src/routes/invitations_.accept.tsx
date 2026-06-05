import {
  Alert,
  Box,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconX } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useTRPC } from '@/trpc/react';

const searchSchema = z.object({
  token: z.string(),
});

/**
 * Returns the appropriate indefinite article ("a" or "an") for a word
 * based on whether it starts with a vowel sound
 */
function getIndefiniteArticle(word: string): string {
  const firstLetter = word.charAt(0).toLowerCase();
  return ['a', 'e', 'i', 'o', 'u'].includes(firstLetter) ? 'an' : 'a';
}

export const Route = createFileRoute('/invitations_/accept')({
  component: RouteComponent,
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient, trpc }, location }) => {
    // Check authentication first
    const hasSession = await queryClient.ensureQueryData(
      trpc.common.hasValidSession.queryOptions(),
    );

    // If not logged in, redirect to login with return URL
    if (!hasSession) {
      throw redirect({
        to: '/auth/login',
        search: {
          redirect: location.href,
        },
      });
    }

    // Parse token from search params
    const { token } = searchSchema.parse(location.search);

    // Fetch invitation details (also primes the cache for the component's
    // useSuspenseQuery below)
    const invitation = await queryClient.ensureQueryData(
      trpc.common.getInvitationDetails.queryOptions({ token }),
    );

    if (!invitation) {
      throw redirect({
        to: '/invitations/invalid',
      });
    }

    // Check if invitation has already been processed
    if (invitation.status !== 'PENDING') {
      if (invitation.status === 'EXPIRED') {
        throw redirect({
          to: '/invitations/expired',
        });
      }
      // For ACCEPTED, DECLINED, or CANCELLED, show invalid page
      throw redirect({
        to: '/invitations/invalid',
      });
    }
  },
});

function RouteComponent() {
  const { token } = Route.useSearch();
  const router = useRouter();
  const trpc = useTRPC();
  const { data: invitation } = useSuspenseQuery(
    trpc.common.getInvitationDetails.queryOptions({ token }),
  );
  const [error, setError] = useState<string | null>(null);
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

  const isVerificationError =
    error === 'You must verify the invited email address first';

  const acceptMutation = useMutation(
    trpc.common.acceptOrganizationInvitation.mutationOptions({
      onSuccess: async (data) => {
        if ('declined' in data && data.declined) {
          await router.navigate({ to: '/' });
          return;
        }

        if ('organizationId' in data && data.organizationId) {
          await router.navigate({
            to: '/dashboard/organizations/$orgId',
            params: { orgId: data.organizationId },
          });
        }
      },
      onError: (error) => {
        setError(error.message || 'Failed to accept invitation');
      },
    }),
  );

  const acceptChannelMutation = useMutation(
    trpc.common.acceptChannelInvitation.mutationOptions({
      onSuccess: async (data) => {
        if ('declined' in data && data.declined) {
          await router.navigate({ to: '/' });
          return;
        }

        if ('channelId' in data && data.channelId) {
          await router.navigate({
            to: '/dashboard/channels/$channelId',
            params: { channelId: data.channelId },
          });
        }
      },
      onError: (error) => {
        setError(error.message || 'Failed to accept invitation');
      },
    }),
  );

  const declineMutation = useMutation(
    trpc.common.acceptOrganizationInvitation.mutationOptions({
      onSuccess: async () => {
        await router.navigate({ to: '/' });
      },
      onError: (error) => {
        setError(error.message || 'Failed to decline invitation');
      },
    }),
  );

  const declineChannelMutation = useMutation(
    trpc.common.acceptChannelInvitation.mutationOptions({
      onSuccess: async () => {
        await router.navigate({ to: '/' });
      },
      onError: (error) => {
        setError(error.message || 'Failed to decline invitation');
      },
    }),
  );

  // The loader already redirected away unless this is a PENDING invitation, but
  // the query exposes the raw discriminated union. Narrowing on `status` here
  // recovers the PENDING variant (the one carrying organization/channel). This
  // sits after all hooks so it doesn't violate the rules of hooks.
  if (!invitation || invitation.status !== 'PENDING') {
    return null;
  }

  const handleAccept = () => {
    if (invitation.type === 'organization') {
      acceptMutation.mutate({
        token,
        accept: true,
      });
    } else {
      acceptChannelMutation.mutate({
        token,
        accept: true,
      });
    }
  };

  const handleDecline = () => {
    if (invitation.type === 'organization') {
      declineMutation.mutate({
        token,
        accept: false,
      });
    } else {
      declineChannelMutation.mutate({
        token,
        accept: false,
      });
    }
  };

  const entityName =
    invitation.type === 'organization'
      ? invitation.organization.name
      : invitation.channel.name;

  const roleName =
    invitation.type === 'organization'
      ? invitation.isAdmin
        ? 'Admin'
        : invitation.canEdit
          ? 'Editor'
          : 'Member'
      : invitation.isAdmin
        ? 'Admin'
        : invitation.canEdit
          ? 'Editor'
          : invitation.canUpload
            ? 'Uploader'
            : 'Member';

  const isPending =
    acceptMutation.isPending ||
    acceptChannelMutation.isPending ||
    declineMutation.isPending ||
    declineChannelMutation.isPending;

  return (
    <Box p="xl" style={{ maxWidth: 600, margin: '0 auto' }}>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Title order={2}>You've Been Invited!</Title>

          <Text>
            You've been invited to join{' '}
            <Text component="span" fw={700}>
              {entityName}
            </Text>{' '}
            as {getIndefiniteArticle(roleName)}{' '}
            <Text component="span" fw={700}>
              {roleName}
            </Text>
            .
          </Text>

          {error ? (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Error"
              color="red"
            >
              <Stack gap="xs">
                <Text size="sm">{error}</Text>
                {isVerificationError && (
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
                )}
              </Stack>
            </Alert>
          ) : null}

          <Group justify="space-between" mt="md">
            <Button
              variant="outline"
              color="gray"
              leftSection={<IconX size={16} />}
              onClick={handleDecline}
              disabled={isPending}
            >
              Decline
            </Button>

            <Button
              leftSection={
                isPending ? (
                  <Loader size="xs" color="white" />
                ) : (
                  <IconCheck size={16} />
                )
              }
              onClick={handleAccept}
              disabled={isPending}
            >
              Accept Invitation
            </Button>
          </Group>

          <Text size="sm" c="dimmed" mt="md">
            This invitation will expire on{' '}
            {new Date(invitation.expiresAt).toLocaleDateString()}.
          </Text>
        </Stack>
      </Card>

      <Box mt="md" ta="center">
        <Link to="/">
          <Text size="sm" c="dimmed">
            Return to home
          </Text>
        </Link>
      </Box>
    </Box>
  );
}
