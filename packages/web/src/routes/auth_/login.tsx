import { Alert, Paper, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import { useState } from 'react';
import { useAppMantineForm } from '@/components/mantine';
import { loginSchema } from '@/schemas/auth';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/auth_/login')({
  component: LoginRoute,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (hasSession) {
      throw redirect({ to: '/' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => ({
    env: await queryClient.fetchQuery(trpc.common.getClientEnv.queryOptions()),
  }),
});

function LoginRoute() {
  const { env } = Route.useLoaderData();
  const [error, setError] = useState<string | false>(false);

  const router = useRouter();
  const trpc = useTRPC();

  const loginMutation = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: async (data) => {
        if (data.error) {
          setError(data.error);
          return;
        }

        await router.invalidate();
        await router.navigate({ to: '/' });
      },
    }),
  );

  const form = useAppMantineForm({
    defaultValues: {
      id: '',
      password: '',
      turnstile: '',
    },
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value }) => {
      loginMutation.mutate(value);
    },
  });

  return (
    <Paper
      radius="md"
      p="lg"
      mt="xl"
      maw="28rem"
      w="100%"
      ml="auto"
      mr="auto"
      withBorder
    >
      <Text size="lg" fw={500}>
        Sign in to your account
      </Text>

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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        method="post"
      >
        <Stack>
          <form.AppField name="id">
            {(field) => (
              <field.TextInputField label="Email or username" required />
            )}
          </form.AppField>

          <form.AppField name="password">
            {(field) => <field.PasswordInputField label="Password" required />}
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
            <form.SubmitButton label="Submit" />
          </form.AppForm>
          <Text size="sm" ta="center" c="dimmed">
            Don't have an account?{' '}
            <Link
              to="/auth/register"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Text component="span" c="blue" style={{ cursor: 'pointer' }}>
                Register here
              </Text>
            </Link>
          </Text>
          <Text size="sm" ta="center" c="dimmed">
            Forgot your password?{' '}
            <Link
              to="/auth/forgot-password"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Text component="span" c="blue" style={{ cursor: 'pointer' }}>
                Reset it here
              </Text>
            </Link>
          </Text>
        </Stack>
      </form>
    </Paper>
  );
}
