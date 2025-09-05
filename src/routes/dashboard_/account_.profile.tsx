import { Button, Card, Group, Stack, Title } from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAppMantineForm } from '@/components/mantine';
import { showFailure, showSuccess } from '@/routes/-mantine';
import { profileUpdateSchema } from '@/schemas/account';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/dashboard_/account_/profile')({
  component: ProfilePage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: () => ({
    backNavigation: {
      label: 'Account Settings',
      to: '/dashboard/account',
    },
  }),
});

function ProfilePage() {
  const trpc = useTRPC();

  const profileQuery = useQuery(trpc.account.getProfile.queryOptions());

  const updateProfileMutation = useMutation(
    trpc.account.updateProfile.mutationOptions({
      onSuccess: async (data) => {
        if (data.error) {
          showFailure({
            title: 'Error',
            message: data.error,
          });
          return;
        }

        showSuccess({
          title: 'Success',
          message: 'Profile updated successfully!',
        });
        await profileQuery.refetch();
      },
      onError: () => {
        showFailure({
          title: 'Error',
          message: 'Error updating profile, please try again!',
        });
      },
    }),
  );

  const form = useAppMantineForm({
    defaultValues: {
      fullName: profileQuery.data?.fullName || '',
      email: profileQuery.data?.email || '',
      username: profileQuery.data?.username || '',
    },
    validators: {
      onChange: profileUpdateSchema,
    },
    onSubmit: async ({ value }) => {
      updateProfileMutation.mutate(value);
    },
  });

  // Update form values when data loads
  if (profileQuery.data) {
    form.reset({
      fullName: profileQuery.data.fullName,
      email: profileQuery.data.email,
      username: profileQuery.data.username,
    });
  }

  return (
    <>
      <Title order={1} mb="lg">
        Profile Information
      </Title>

      <Card shadow="xs" padding="lg" radius="md" withBorder maw={600}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          method="post"
        >
          <Stack gap="md">
            <form.AppField name="fullName">
              {(field) => (
                <field.TextInputField
                  label="Full Name"
                  placeholder="Enter your full name"
                />
              )}
            </form.AppField>

            <form.AppField name="email">
              {(field) => (
                <field.TextInputField
                  label="Email"
                  placeholder="your@email.com"
                  type="email"
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

            <Group justify="flex-end" mt="md">
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" loading={isSubmitting}>
                    Save Changes
                  </Button>
                )}
              </form.Subscribe>
            </Group>
          </Stack>
        </form>
      </Card>
    </>
  );
}
