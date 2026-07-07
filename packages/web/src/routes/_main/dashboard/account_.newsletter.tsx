import { IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

import { Alert, Text, Title } from '@/components/ui';
import { useAppForm } from '@/components/ui/form';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/dashboard/account_/newsletter')({
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
    // Prime the env query (read back via useSuspenseQuery in the component);
    // backNavigation is loader-only data the dashboard layout reads.
    await context.queryClient.ensureQueryData(
      context.trpc.common.getClientEnv.queryOptions(),
    );

    return {
      backNavigation: {
        label: 'Account',
        to: '/dashboard/account',
      },
    };
  },
});

function NewsletterPage() {
  const trpc = useTRPC();
  const { data: env } = useSuspenseQuery(
    trpc.common.getClientEnv.queryOptions(),
  );
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

  const form = useAppForm({
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
      <Title order={1} className="mb-5">
        Newsletter Settings
      </Title>

      <div className="flex max-w-[600px] flex-col gap-5">
        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <Title order={3} className="mb-4">
            Subscribe to Newsletter
          </Title>

          <Text size="sm" c="dimmed" className="mb-4">
            Get updates on new features, platform improvements, and upcoming
            changes. No spam, just the important stuff.
          </Text>

          {success ? (
            <Alert
              icon={<IconInfoCircle />}
              color="green"
              withCloseButton
              onClose={() => setSuccess(null)}
              className="mb-4"
            >
              {success}
            </Alert>
          ) : null}

          {error ? (
            <Alert
              icon={<IconInfoCircle />}
              color="red"
              withCloseButton
              onClose={() => setError(null)}
              className="mb-4"
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
            <div className="flex flex-col gap-4">
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

              <div className="flex flex-col items-center gap-4">
                <form.AppField name="turnstileToken">
                  {(field) => (
                    <field.TurnstileField siteKey={env.TURNSTILE_SITE_KEY} />
                  )}
                </form.AppField>
              </div>

              <form.AppForm>
                <form.SubmitButton label="Subscribe to Newsletter" />
              </form.AppForm>
            </div>
          </form>
        </div>

        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <Title order={3} className="mb-4">
            Unsubscribe
          </Title>

          <Text size="sm" c="dimmed" className="mb-4">
            To unsubscribe from the newsletter, please use the unsubscribe link
            at the bottom of any newsletter email you've received.
          </Text>
        </div>
      </div>
    </>
  );
}
