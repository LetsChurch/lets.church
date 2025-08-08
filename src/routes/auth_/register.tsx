import { Alert, Paper, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getWebRequest } from '@tanstack/react-start/server';
import argon2 from 'argon2';
import { useState } from 'react';
import { z } from 'zod';
import { useAppMantineForm } from '@/components/mantine';
import { postUserRegistration } from '@/temporal';
import db from '@/util/db';
import { getClientIpAddress } from '@/util/request-ip';
import { validateTurnstile } from '@/util/turnstile';
import testPassword from '@/util/zxcvbn';
import { getClientEnv } from '../-functions';

const schema = z.object({
  email: z.email('Invalid email address'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string(),
  agreeToTheology: z
    .boolean()
    .refine(
      (val) => val === true,
      'You must agree to the Statement of Theology',
    ),
  agreeToTerms: z
    .boolean()
    .refine(
      (val) => val === true,
      'You must agree to the Terms and Conditions',
    ),
  subscribeNewsletter: z.boolean(),
  turnstile: z.string(),
});

type HandleRegisterResponse = { error: false } | { error: string };

export const handleRegister = createServerFn({
  method: 'POST',
  response: 'data',
})
  .validator(schema)
  .handler(async ({ data: value }): Promise<HandleRegisterResponse> => {
    if (
      !(await validateTurnstile(
        value.turnstile,
        getClientIpAddress(getWebRequest().headers),
      ))
    ) {
      return { error: 'Invalid CAPTCHA' };
    }

    const passwordTest = testPassword(value.password);

    if (passwordTest) {
      return { error: passwordTest };
    }

    try {
      const hash = await argon2.hash(value.password, {
        type: argon2.argon2id,
      });
      const user = await db.appUser.create({
        data: {
          username: value.username,
          fullName: value.fullName || null,
          password: hash,
          emails: {
            create: {
              email: value.email,
            },
          },
        },
      });

      await postUserRegistration(user.id, {
        userId: user.id,
        username: value.username,
        email: value.email,
        subscribeToNewsletter: value.subscribeNewsletter,
      });

      return { error: false };
    } catch (_e) {
      return { error: 'Error registering a new account, please try again!' };
    }
  });

export const Route = createFileRoute('/auth_/register')({
  component: RouteComponent,
  loader: async () => ({
    env: await getClientEnv(),
  }),
});

function RouteComponent() {
  const { env } = Route.useLoaderData();
  const [error, setError] = useState<string | false>(false);

  const router = useRouter();
  const queryClient = useQueryClient();

  const registerMutation = useMutation({
    mutationFn: handleRegister,
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
  });

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
      onChange: schema,
    },
    onSubmit: async ({ value }) => {
      registerMutation.mutate({ data: value });
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
