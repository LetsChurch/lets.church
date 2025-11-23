import { Alert, Card, Stack, Text, Title } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useAppMantineForm } from '@/components/mantine';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/dashboard_/account_/newsletter')({
  component: NewsletterPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context }) => {
    const env = await context.queryClient.fetchQuery(
      context.trpc.common.getClientEnv.queryOptions(),
    );

    return {
      env,
      backNavigation: {
        label: 'Account',
        to: '/dashboard/account',
      },
    };
  },
});

function NewsletterPage() {
  const { env } = Route.useLoaderData();
  const trpc = useTRPC();
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subscribeMutation = useMutation(
    trpc.newsletter.subscribe.mutationOptions({
      onSuccess: (data) => {
        if (data.success) {
          setSuccess('Successfully subscribed to the newsletter!');
          setError(null);
          form.reset();
        } else {
          setError(data.error || 'Failed to subscribe. Please try again.');
          setSuccess(null);
        }
      },
      onError: () => {
        setError('Unable to subscribe at this time. Please try again later.');
        setSuccess(null);
      },
    }),
  );

  const form = useAppMantineForm({
    defaultValues: {
      email: '',
      turnstileToken: '',
    },
    onSubmit: async ({ value }) => {
      setSuccess(null);
      setError(null);
      subscribeMutation.mutate({
        email: value.email,
        turnstileToken: value.turnstileToken,
      });
    },
  });

  return (
    <>
      <Title order={1} mb="lg">
        Newsletter Settings
      </Title>

      <Stack gap="lg" maw={600}>
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Title order={3} mb="md">
            Subscribe to Newsletter
          </Title>

          <Text size="sm" c="dimmed" mb="md">
            Get updates on new features, platform improvements, and upcoming
            changes. No spam, just the important stuff.
          </Text>

          {success ? (
            <Alert
              icon={<IconInfoCircle />}
              color="green"
              mb="md"
              withCloseButton
              onClose={() => setSuccess(null)}
            >
              {success}
            </Alert>
          ) : null}

          {error ? (
            <Alert
              icon={<IconInfoCircle />}
              color="red"
              mb="md"
              withCloseButton
              onClose={() => setError(null)}
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
          >
            <Stack>
              <form.AppField name="email">
                {(field) => (
                  <field.TextInputField
                    label="Email Address"
                    placeholder="your@email.com"
                    required
                    type="email"
                  />
                )}
              </form.AppField>

              <Stack align="center">
                <form.AppField name="turnstileToken">
                  {(field) => (
                    <field.TurnstileField siteKey={env.TURNSTILE_SITE_KEY} />
                  )}
                </form.AppField>
              </Stack>

              <form.AppForm>
                <form.SubmitButton label="Subscribe to Newsletter" />
              </form.AppForm>
            </Stack>
          </form>
        </Card>

        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Title order={3} mb="md">
            Unsubscribe
          </Title>

          <Text size="sm" c="dimmed" mb="md">
            To unsubscribe from the newsletter, please use the unsubscribe link
            at the bottom of any newsletter email you've received.
          </Text>
        </Card>
      </Stack>
    </>
  );
}
