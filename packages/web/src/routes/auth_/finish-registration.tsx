import { IconInfoCircle, IconUserPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { Alert, Button, Loader, Text } from '@/components/ui';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/auth_/finish-registration')({
  component: FinishRegistrationRoute,
  validateSearch: z.object({ token: z.string().optional() }),
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (hasSession) {
      throw redirect({ to: '/' });
    }
  },
});

// The account is created only on this button press (a POST), never on the
// GET: mail scanners that prefetch the emailed link must not use it up.
function FinishRegistrationRoute() {
  const { token = '' } = Route.useSearch();
  const [error, setError] = useState<string | false>(false);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const details = useQuery({
    ...trpc.auth.getRegistrationDetails.queryOptions({ token }),
    enabled: token.length >= 32,
  });
  const completeMutation = useMutation(
    trpc.auth.completeRegistration.mutationOptions({
      onSuccess: async (data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        await queryClient.invalidateQueries();
        window.location.assign(('redirect' in data && data.redirect) || '/');
      },
      onError: () => {
        setError('We could not create your account. Try the link again.');
      },
    }),
  );

  const invalid =
    token.length < 32 || details.isError || details.data?.valid === false;

  return (
    <div className="border-fancy-pants rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
      <Text size="lg" fw={600}>
        Finish creating your account
      </Text>

      {!invalid && details.isPending ? (
        <div className="mt-5 flex justify-center">
          <Loader />
        </div>
      ) : null}

      {invalid || error ? (
        <Alert
          title="This link did not work"
          icon={<IconInfoCircle />}
          color="red"
          className="mt-4"
        >
          {error || 'This link is invalid, has expired, or was already used.'}{' '}
          <Link
            to="/auth/register"
            className="font-medium underline underline-offset-2"
          >
            Register again
          </Link>{' '}
          or{' '}
          <Link
            to="/auth/login"
            className="font-medium underline underline-offset-2"
          >
            sign in
          </Link>
          .
        </Alert>
      ) : null}

      {!invalid && details.data?.valid && !error ? (
        <>
          <Text size="sm" c="dimmed" className="mt-3">
            Continue to confirm your email address and create your Let&apos;s
            Church account.
          </Text>
          <Button
            fullWidth
            className="mt-5"
            loading={completeMutation.isPending}
            leftSection={<IconUserPlus size={17} />}
            onClick={() => {
              setError(false);
              completeMutation.mutate({ token });
            }}
          >
            Create my account
          </Button>
          <Text size="xs" c="dimmed" ta="center" className="mt-3">
            The link works once and expires 24 hours after you signed up.
          </Text>
        </>
      ) : null}
    </div>
  );
}
