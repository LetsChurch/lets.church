import { IconCheck, IconInfoCircle, IconMail } from '@tabler/icons-react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  redirect,
  useLocation,
} from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { Alert, Button, Loader, Text } from '@/components/ui';
import { useAppForm } from '@/components/ui/form';
import { donationEmailFromHistoryState } from '@/donations/sign-in-state';
import { emailSchema } from '@/schemas/auth';
import { useTRPC } from '@/trpc/react';
import { safeRedirect } from '@/util/safe-redirect';

const emailSignInSearchSchema = z.object({
  token: z.string().optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/auth_/email-sign-in')({
  component: EmailSignInRoute,
  validateSearch: emailSignInSearchSchema,
  beforeLoad: async ({ context, search }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (hasSession) {
      const destination = safeRedirect(search.redirect);
      throw destination
        ? redirect({ href: destination })
        : redirect({ to: '/' });
    }
  },
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.common.getClientEnv.queryOptions()),
});

function EmailSignInRoute() {
  const { token, redirect: redirectTo } = Route.useSearch();
  const donationEmail = useLocation({
    select: (location) => donationEmailFromHistoryState(location.state),
  });
  return token ? (
    <CompleteEmailSignIn token={token} />
  ) : (
    <RequestEmailSignIn redirectTo={redirectTo} initialEmail={donationEmail} />
  );
}

function CompleteEmailSignIn({ token }: { token: string }) {
  const [error, setError] = useState<string | false>(false);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const details = useQuery(
    trpc.auth.getEmailSignInDetails.queryOptions({ token }),
  );
  const completeMutation = useMutation(
    trpc.auth.completeEmailSignIn.mutationOptions({
      onSuccess: async (data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        await queryClient.invalidateQueries();
        window.location.assign(data.redirect ?? '/');
      },
      onError: () => {
        setError('We could not sign you in. Request a new email.');
      },
    }),
  );

  return (
    <div className="border-fancy-pants rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
      <Text size="lg" fw={600}>
        Finish signing in
      </Text>
      <Text size="sm" c="dimmed" className="mt-3">
        Continue to confirm this email address and sign in. If it is new to
        Let&apos;s Church, we&apos;ll create an account for it.
      </Text>

      {details.isPending ? (
        <div className="mt-5 flex justify-center">
          <Loader />
        </div>
      ) : null}

      {details.isError || details.data?.valid === false ? (
        <Alert
          title="This link did not work"
          icon={<IconInfoCircle />}
          color="red"
          className="mt-4"
        >
          This sign-in link is invalid or has expired.{' '}
          <Link
            to="/auth/email-sign-in"
            className="font-medium underline underline-offset-2"
          >
            Send a new sign-in email
          </Link>
          .
        </Alert>
      ) : error ? (
        <Alert
          title="This link did not work"
          icon={<IconInfoCircle />}
          color="red"
          className="mt-4"
        >
          {error}{' '}
          <Link
            to="/auth/email-sign-in"
            className="font-medium underline underline-offset-2"
          >
            Send a new sign-in email
          </Link>
          .
        </Alert>
      ) : null}

      {details.data?.valid ? (
        <>
          <Button
            fullWidth
            className="mt-5"
            loading={completeMutation.isPending}
            leftSection={<IconMail size={17} />}
            onClick={() => {
              setError(false);
              completeMutation.mutate({ token });
            }}
          >
            Continue to Let&apos;s Church
          </Button>
          <Text size="xs" c="dimmed" ta="center" className="mt-3">
            Each sign-in link works once and expires after 20 minutes.
          </Text>
        </>
      ) : null}
    </div>
  );
}

function RequestEmailSignIn({
  redirectTo,
  initialEmail,
}: {
  redirectTo?: string;
  initialEmail?: string;
}) {
  const [error, setError] = useState<string | false>(false);
  const [sent, setSent] = useState(false);
  const trpc = useTRPC();
  const { data: env } = useSuspenseQuery(
    trpc.common.getClientEnv.queryOptions(),
  );
  const requestMutation = useMutation(
    trpc.auth.requestEmailSignIn.mutationOptions({
      onSuccess: (data) => {
        if (data.error) {
          setError(data.error);
          form.setFieldValue('hcaptchaToken', '');
          return;
        }
        setSent(true);
      },
      onError: () => {
        setError('We could not send the sign-in email. Try again shortly.');
        form.setFieldValue('hcaptchaToken', '');
      },
    }),
  );
  const form = useAppForm({
    defaultValues: {
      email: initialEmail ?? '',
      hcaptchaToken: '',
    },
    validators: {
      onChange: z.object({
        email: emailSchema,
        hcaptchaToken: z.string().min(1, 'Please complete the CAPTCHA'),
      }),
    },
    onSubmit: async ({ value }) => {
      setError(false);
      requestMutation.mutate({
        ...value,
        redirect: safeRedirect(redirectTo),
      });
    },
  });

  return (
    <div className="border-fancy-pants rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
      <Text size="lg" fw={600}>
        Sign in by email
      </Text>
      <Text size="sm" c="dimmed" className="mt-3">
        We&apos;ll email you a secure link. You can use it to access an existing
        account, or create one without choosing a password.
      </Text>

      {sent ? (
        <>
          <Alert
            title="Check your email"
            icon={<IconCheck />}
            color="green"
            className="mt-4"
          >
            Open the sign-in email on this device. The link expires after 20
            minutes.
          </Alert>
          <Button
            variant="light"
            fullWidth
            className="mt-4"
            onClick={() => {
              setSent(false);
              form.setFieldValue('hcaptchaToken', '');
            }}
          >
            Use a different email
          </Button>
        </>
      ) : (
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
        >
          {error ? (
            <Alert
              title="Email not sent"
              icon={<IconInfoCircle />}
              color="red"
              withCloseButton
              onClose={() => setError(false)}
              className="mb-4"
            >
              {error}
            </Alert>
          ) : null}
          <div className="flex flex-col gap-4">
            <form.AppField name="email">
              {(field) => (
                <field.TextInputField label="Email address" required />
              )}
            </form.AppField>
            <div className="flex justify-center">
              <form.AppField name="hcaptchaToken">
                {(field) => (
                  <field.HCaptchaField sitekey={env.HCAPTCHA_SITE_KEY} />
                )}
              </form.AppField>
            </div>
            <form.AppForm>
              <form.SubmitButton label="Email me a sign-in link" />
            </form.AppForm>
          </div>
        </form>
      )}

      <Text size="sm" ta="center" c="dimmed" className="mt-4">
        Prefer a password?{' '}
        <Link
          to="/auth/login"
          search={redirectTo ? { redirect: redirectTo } : {}}
          className="text-brand"
        >
          Sign in with it
        </Link>
      </Text>
    </div>
  );
}
