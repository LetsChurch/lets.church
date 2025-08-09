import { Alert, Paper, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getWebRequest, setCookie } from '@tanstack/react-start/server';
import { useState } from 'react';
import { z } from 'zod';
import { useAppMantineForm } from '@/components/mantine';
import { login } from '@/util/auth';
import { createSessionJwt } from '@/util/jwt';
import { getClientIpAddress } from '@/util/request-ip';
import { validateTurnstile } from '@/util/turnstile';
import {
  getClientEnv,
  hasValidSession,
  requireAnonMiddleware,
} from '../-functions';

const schema = z.object({
  id: z.string().min(1, 'Email or Username is required'),
  password: z.string().min(1, 'Password is required'),
  turnstile: z.string(),
});

type HandleLoginResponse = { error: false } | { error: string };

export const handleLogin = createServerFn({
  method: 'POST',
  response: 'data',
})
  .middleware([requireAnonMiddleware])
  .validator(schema)
  .handler(
    async ({
      data: { id, password, turnstile },
    }): Promise<HandleLoginResponse> => {
      if (await hasValidSession()) {
        return { error: 'Already logged in' };
      }

      if (
        !(await validateTurnstile(
          turnstile,
          getClientIpAddress(getWebRequest().headers),
        ))
      ) {
        return { error: 'Invalid CAPTCHA' };
      }

      try {
        const session = await login(id, password);

        setCookie('lc-session', await createSessionJwt({ sub: session.id }), {
          sameSite: 'lax',
        });

        return { error: false };
      } catch (_e) {
        return { error: 'Invalid user id or password' };
      }
    },
  );

export const Route = createFileRoute('/auth_/login')({
  component: LoginRoute,
  beforeLoad: async () => {
    if (await hasValidSession()) {
      return redirect({ to: '/' });
    }
  },
  loader: async () => ({
    env: await getClientEnv(),
  }),
});

function LoginRoute() {
  const { env } = Route.useLoaderData();
  const [error, setError] = useState<string | false>(false);

  const router = useRouter();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (...args: Parameters<typeof handleLogin>) => {
      return handleLogin(...args);
    },
    onSuccess: async (data) => {
      if (data.error) {
        setError(data.error);
        return;
      }

      await router.invalidate();
      await queryClient.invalidateQueries();
      await router.navigate({ to: '/' });
    },
    onError: () => {
      setError('Error logging in, please try again!');
    },
  });

  const form = useAppMantineForm({
    defaultValues: {
      id: '',
      password: '',
      turnstile: '',
    },
    validators: {
      onChange: schema,
    },
    onSubmit: async ({ value }) => {
      loginMutation.mutate({ data: value });
    },
  });

  return (
    <Paper radius="md" p="lg" mt="xl" w="28rem" ml="auto" mr="auto" withBorder>
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
        </Stack>
      </form>
    </Paper>
  );
}
