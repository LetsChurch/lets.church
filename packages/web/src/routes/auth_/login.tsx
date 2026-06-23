import { Alert, Paper, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
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
import { safeRedirect } from '@/util/safe-redirect';

export const Route = createFileRoute('/auth_/login')({
  component: LoginRoute,
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  beforeLoad: async ({ context, search }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (hasSession) {
      const dest = safeRedirect(search.redirect);
      // The destination may be a server route (e.g. /oidc/authorize); use a hard
      // redirect so the request actually hits the server handler.
      throw dest ? redirect({ href: dest }) : redirect({ to: '/' });
    }
  },
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.common.getClientEnv.queryOptions()),
});

function LoginRoute() {
  const [error, setError] = useState<string | false>(false);

  const router = useRouter();
  const { redirect: redirectTo } = Route.useSearch();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: env } = useSuspenseQuery(
    trpc.common.getClientEnv.queryOptions(),
  );

  const loginMutation = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: async (data) => {
        if (data.error) {
          setError(data.error);
          return;
        }

        // Logging in changes the authenticated identity, so every cached query
        // may now be wrong (session, current user, follows, ratings, dashboard
        // data, …). Invalidate the whole cache so active queries refetch and
        // loaders re-run against the new session. router.invalidate() alone
        // only re-runs loaders, which read through fetchQuery — and the default
        // staleTime would otherwise keep the logged-out session data "fresh",
        // leaving the UI (e.g. the header's login button) stuck.
        await queryClient.invalidateQueries();

        // If we arrived here with a redirect target (e.g. an OIDC authorize
        // request), send the user back with a full navigation so the server
        // route can resume the flow.
        const dest = safeRedirect(redirectTo);
        if (dest) {
          window.location.assign(dest);
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
