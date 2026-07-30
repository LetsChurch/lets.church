import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { Alert, Button, Checkbox, Text, Title } from '@/components/ui';
import { showFailure } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';
import { safeRedirect } from '@/util/safe-redirect';

const participationSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/_main/dashboard/account_/participation')(
  {
    component: ParticipationPage,
    validateSearch: participationSearchSchema,
    beforeLoad: async ({ context, search }) => {
      const hasSession = await context.queryClient.fetchQuery(
        context.trpc.common.hasValidSession.queryOptions(),
      );
      if (!hasSession) {
        const destination = safeRedirect(search.redirect);
        throw redirect({
          to: '/auth/login',
          search: {
            redirect: destination
              ? `/dashboard/account/participation?redirect=${encodeURIComponent(destination)}`
              : '/dashboard/account/participation',
          },
        });
      }
    },
    loader: async ({ context: { queryClient, trpc } }) => {
      await queryClient.ensureQueryData(
        trpc.account.getParticipationStatus.queryOptions(),
      );
      return {
        backNavigation: {
          label: 'Account Settings',
          to: '/dashboard/account',
        },
      };
    },
  },
);

function ParticipationPage() {
  const { redirect: redirectTo } = Route.useSearch();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: status } = useSuspenseQuery(
    trpc.account.getParticipationStatus.queryOptions(),
  );
  const [statementOfTheology, setStatementOfTheology] = useState(
    status.statementOfTheologyAccepted,
  );
  const [terms, setTerms] = useState(status.termsAccepted);

  const acceptMutation = useMutation(
    trpc.account.acceptParticipationAgreements.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        window.location.assign(
          safeRedirect(redirectTo) ?? '/dashboard/account',
        );
      },
      onError: (error) => {
        showFailure({
          title: 'Could not save your choices',
          message: error.message,
        });
      },
    }),
  );

  return (
    <>
      <Title order={1} className="mb-2">
        Participation policies
      </Title>
      <Text c="dimmed" className="mb-5 max-w-[640px]">
        You can sign in, view your donation history, and manage recurring
        donations without accepting these policies. We require them before you
        comment, rate content, or create a channel or church.
      </Text>

      <div className="border-fancy-pants flex max-w-[640px] flex-col gap-5 rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
        {status.accepted ? (
          <Alert color="green" title="Policies accepted">
            Your account can participate in the community.
          </Alert>
        ) : null}

        <Checkbox
          checked={statementOfTheology}
          onChange={setStatementOfTheology}
          disabled={status.statementOfTheologyAccepted}
          required
          label={
            <>
              I agree to the Let&apos;s Church{' '}
              <Link
                to="/about/theology"
                className="underline underline-offset-2"
                target="_blank"
              >
                Statement of Theology
              </Link>
            </>
          }
        />
        <Checkbox
          checked={terms}
          onChange={setTerms}
          disabled={status.termsAccepted}
          required
          label={
            <>
              I agree to the{' '}
              <Link
                to="/about/terms"
                className="underline underline-offset-2"
                target="_blank"
              >
                Terms and Conditions
              </Link>{' '}
              and acknowledge the{' '}
              <Link
                to="/about/privacy"
                className="underline underline-offset-2"
                target="_blank"
              >
                Privacy Policy
              </Link>
            </>
          }
        />

        <div className="flex justify-end">
          <Button
            loading={acceptMutation.isPending}
            disabled={status.accepted || !statementOfTheology || !terms}
            onClick={() =>
              acceptMutation.mutate({
                statementOfTheology: true,
                terms: true,
              })
            }
          >
            Accept and continue
          </Button>
        </div>
      </div>
    </>
  );
}
