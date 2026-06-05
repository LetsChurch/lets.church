import { Alert, Paper, Stack, Text } from '@mantine/core';
import { IconCheck, IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { useAppMantineForm } from '@/components/mantine';
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
          return;
        }

        setSuccess(true);
      },
      onError: () => {
        setError('Error processing request, please try again!');
      },
    }),
  );

  const form = useAppMantineForm({
    defaultValues: {
      identifier: '',
      turnstile: '',
    },
    validators: {
      onChange: z.object({
        identifier: z.string().min(1, 'Email or username is required'),
        turnstile: z.string().min(1, 'Please complete the CAPTCHA'),
      }),
    },
    onSubmit: async ({ value }) => {
      forgotPasswordMutation.mutate(value);
    },
  });

  return (
    <Paper radius="md" p="lg" mt="xl" w="28rem" ml="auto" mr="auto" withBorder>
      <Text size="lg" fw={500}>
        Reset your password
      </Text>

      {success ? (
        <Alert
          title="Check your email"
          icon={<IconCheck />}
          color="green"
          mb="md"
          mt="md"
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
          mb="md"
          mt="md"
          withCloseButton
          onClose={() => setError(false)}
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
          <Stack>
            <Text size="sm" c="dimmed" mt="sm">
              Enter your email address or username and we'll send you a link to
              reset your password.
            </Text>

            <form.AppField name="identifier">
              {(field) => (
                <field.TextInputField label="Email or username" required />
              )}
            </form.AppField>

            <Stack align="center">
              <form.AppField name="turnstile">
                {(field) => (
                  <field.TurnstileField siteKey={env.TURNSTILE_SITE_KEY} />
                )}
              </form.AppField>
            </Stack>
          </Stack>

          <Stack mt="md" gap="md">
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
          </Stack>
        </form>
      ) : (
        <Stack mt="md" gap="md">
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
        </Stack>
      )}
    </Paper>
  );
}
