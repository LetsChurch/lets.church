import { IconCheck, IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { Alert, Text } from '@/components/ui';
import { useAppForm } from '@/components/ui/form';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/auth_/forgot-password')({
  component: ForgotPasswordRoute,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (hasSession) {
      throw redirect({ to: '/' });
    }
  },
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.common.getClientEnv.queryOptions()),
});

function ForgotPasswordRoute() {
  const [error, setError] = useState<string | false>(false);
  const [success, setSuccess] = useState(false);

  const trpc = useTRPC();
  const { data: env } = useSuspenseQuery(
    trpc.common.getClientEnv.queryOptions(),
  );

  const forgotPasswordMutation = useMutation(
    trpc.auth.forgotPassword.mutationOptions({
      onSuccess: async (data) => {
        if (data.error) {
          setError(data.error);
          form.setFieldValue('hcaptchaToken', '');
          return;
        }

        setSuccess(true);
      },
      onError: () => {
        setError('Error processing request, please try again!');
        form.setFieldValue('hcaptchaToken', '');
      },
    }),
  );

  const form = useAppForm({
    defaultValues: {
      identifier: '',
      hcaptchaToken: '',
    },
    validators: {
      onChange: z.object({
        identifier: z.string().min(1, 'Email or username is required'),
        hcaptchaToken: z.string().min(1, 'Please complete the CAPTCHA'),
      }),
    },
    onSubmit: async ({ value }) => {
      forgotPasswordMutation.mutate(value);
    },
  });

  return (
    <div className="border-fancy-pants rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
      <Text size="lg" fw={500}>
        Reset your password
      </Text>

      {success ? (
        <Alert
          title="Check your email"
          icon={<IconCheck />}
          color="green"
          className="mt-4 mb-4"
        >
          If an account exists with that email or username, you will receive a
          password reset link shortly.
        </Alert>
      ) : null}

      {error ? (
        <Alert
          title="Error"
          icon={<IconInfoCircle />}
          color="red"
          withCloseButton
          onClose={() => setError(false)}
          className="mt-4 mb-4"
        >
          {error}
        </Alert>
      ) : null}

      {!success ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          method="post"
        >
          <div className="flex flex-col gap-4">
            <Text size="sm" c="dimmed" className="mt-3">
              Enter your email address or username and we'll send you a link to
              reset your password.
            </Text>

            <form.AppField name="identifier">
              {(field) => (
                <field.TextInputField label="Email or username" required />
              )}
            </form.AppField>

            <div className="flex flex-col items-center gap-4">
              <form.AppField name="hcaptchaToken">
                {(field) => (
                  <field.HCaptchaField sitekey={env.HCAPTCHA_SITE_KEY} />
                )}
              </form.AppField>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <form.AppForm>
              <form.SubmitButton label="Send reset link" />
            </form.AppForm>
            <Text size="sm" ta="center" c="dimmed">
              Remember your password?{' '}
              <Link
                to="/auth/login"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <Text component="span" c="blue" style={{ cursor: 'pointer' }}>
                  Back to login
                </Text>
              </Link>
            </Text>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <Text size="sm" ta="center" c="dimmed">
            <Link
              to="/auth/login"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Text component="span" c="blue" style={{ cursor: 'pointer' }}>
                Back to login
              </Text>
            </Link>
          </Text>
        </div>
      )}
    </div>
  );
}
