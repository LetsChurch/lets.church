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
import { z } from 'zod';
import { useAppMantineForm } from '@/components/mantine';
import { registerSchema } from '@/schemas/auth';
import { useTRPC } from '@/trpc/react';

const searchSchema = z.object({
  email: z.string().email().optional().catch(undefined),
});

export const Route = createFileRoute('/auth_/register')({
  component: RouteComponent,
  validateSearch: searchSchema,
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

function RouteComponent() {
  const search = Route.useSearch();
  const [error, setError] = useState<string | false>(false);

  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: env } = useSuspenseQuery(
    trpc.common.getClientEnv.queryOptions(),
  );

  const registerMutation = useMutation(
    trpc.auth.register.mutationOptions({
      onSuccess: async (data) => {
        if (data.error) {
          setError(data.error);
          return;
        }

        // Registering logs the user in, changing the authenticated identity, so
        // invalidate the whole query cache before re-running loaders. Without
        // this the default staleTime keeps the logged-out session data "fresh"
        // and the UI (e.g. the header's login button) never updates.
        await queryClient.invalidateQueries();
        await router.invalidate();
        await router.navigate({ to: '/' });
      },
      onError: (error) => {
        // Ignore cancelled/aborted errors - they happen when navigating away during registration
        const errorCause = (error as { cause?: Error }).cause;
        if (
          errorCause instanceof Error &&
          (errorCause.name === 'AbortError' ||
            errorCause.name === 'CancelledError')
        ) {
          return;
        }
        setError('Error registering a new account, please try again!');
      },
    }),
  );

  const form = useAppMantineForm({
    defaultValues: {
      email: search.email || '',
      username: '',
      password: '',
      fullName: '',
      agreeToTheology: false,
      agreeToTerms: false,
      subscribeNewsletter: true,
      turnstile: '',
    },
    validators: {
      onSubmit: registerSchema,
    },
    onSubmit: async ({ value }) => {
      registerMutation.mutate(value);
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
        Register for an account
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
          <form.AppField name="email">
            {(field) => (
              <field.TextInputField
                label="Email"
                placeholder="your@email.com"
                required
              />
            )}
          </form.AppField>

          <form.AppField name="username">
            {(field) => (
              <field.TextInputField
                label="Username"
                placeholder="Your username"
                required
              />
            )}
          </form.AppField>

          <form.AppField name="password">
            {(field) => (
              <field.PasswordInputField
                label="Password"
                placeholder="Your password"
                required
              />
            )}
          </form.AppField>

          <form.AppField name="fullName">
            {(field) => (
              <field.TextInputField
                label="Full Name"
                placeholder="Your full name"
              />
            )}
          </form.AppField>

          <form.AppField name="agreeToTheology">
            {(field) => (
              <field.CheckboxField
                label={
                  <>
                    I agree to the Let's Church{' '}
                    <Link
                      to="/about/theology"
                      style={{ textDecoration: 'underline' }}
                      target="_blank"
                    >
                      Statement of Theology
                    </Link>
                  </>
                }
                required
              />
            )}
          </form.AppField>

          <form.AppField name="agreeToTerms">
            {(field) => (
              <field.CheckboxField
                label={
                  <>
                    I agree to the{' '}
                    <Link
                      to="/about/terms"
                      style={{ textDecoration: 'underline' }}
                      target="_blank"
                    >
                      Terms and Conditions
                    </Link>{' '}
                    and{' '}
                    <Link
                      to="/about/privacy"
                      style={{ textDecoration: 'underline' }}
                      target="_blank"
                    >
                      Privacy Policy
                    </Link>
                  </>
                }
                required
              />
            )}
          </form.AppField>

          <form.AppField name="subscribeNewsletter">
            {(field) => (
              <field.CheckboxField label="Subscribe to the Let's Church Newsletter" />
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

        <Stack mt="lg" gap="md">
          <form.AppForm>
            <form.SubmitButton label="Register" />
          </form.AppForm>
          <Text size="sm" ta="center" c="dimmed">
            Already have an account?{' '}
            <Link
              to="/auth/login"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Text component="span" c="blue" style={{ cursor: 'pointer' }}>
                Login here
              </Text>
            </Link>
          </Text>
        </Stack>
      </form>
    </Paper>
  );
}
