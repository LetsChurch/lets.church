import { Alert, Paper, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import { useState } from 'react';
import { useAppMantineForm } from '@/components/mantine';
import { registerSchema } from '@/schemas/auth';
import { useTRPC } from '@/trpc/react';
import { getClientEnv, hasValidSession } from '../-functions';

export const Route = createFileRoute('/auth_/register')({
  component: RouteComponent,
  beforeLoad: async () => {
    if (await hasValidSession()) {
      return redirect({ to: '/' });
    }
  },
  loader: async () => ({
    env: await getClientEnv(),
  }),
});

function RouteComponent() {
  const { env } = Route.useLoaderData();
  const [error, setError] = useState<string | false>(false);

  const router = useRouter();
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const registerMutation = useMutation(
    trpc.auth.register.mutationOptions({
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
        setError('Error registering a new account, please try again!');
      },
    }),
  );

  const form = useAppMantineForm({
    defaultValues: {
      email: '',
      username: '',
      password: '',
      fullName: '',
      agreeToTheology: false,
      agreeToTerms: false,
      subscribeNewsletter: true,
      turnstile: '',
    },
    validators: {
      onChange: registerSchema,
    },
    onSubmit: async ({ value }) => {
      registerMutation.mutate(value);
    },
  });

  return (
    <Paper radius="md" p="lg" mt="xl" w="28rem" ml="auto" mr="auto" withBorder>
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
                label="I agree to the Let's Church Statement of Theology"
                required
              />
            )}
          </form.AppField>

          <form.AppField name="agreeToTerms">
            {(field) => (
              <field.CheckboxField
                label="I agree to the Terms and Conditions and Privacy Policy"
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
