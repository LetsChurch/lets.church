import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAppMantineForm } from '@/components/mantine';
import { showFailure, showSuccess } from '@/routes/-mantine';
import { passwordChangeSchema } from '@/schemas/account';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/dashboard_/account_/security')({
  component: SecurityPage,
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

function SecurityPage() {
  const trpc = useTRPC();

  const changePasswordMutation = useMutation(
    trpc.account.changePassword.mutationOptions({
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
          message: 'Password changed successfully!',
        });
        form.reset();
      },
      onError: () => {
        showFailure({
          title: 'Error',
          message: 'Error changing password, please try again!',
        });
      },
    }),
  );

  const form = useAppMantineForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    validators: {
      onChange: passwordChangeSchema,
    },
    onSubmit: async ({ value }) => {
      changePasswordMutation.mutate(value);
    },
  });

  return (
    <>
      <Title order={1} mb="lg">
        Password & Security
      </Title>

      <Stack gap="lg" maw={600}>
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Text fw={500} mb="md">
            Change Password
          </Text>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            method="post"
          >
            <Stack gap="md">
              <form.AppField name="currentPassword">
                {(field) => (
                  <field.PasswordInputField
                    label="Current Password"
                    placeholder="Enter your current password"
                    required
                  />
                )}
              </form.AppField>

              <form.AppField name="newPassword">
                {(field) => (
                  <field.PasswordInputField
                    label="New Password"
                    placeholder="Enter your new password"
                    required
                  />
                )}
              </form.AppField>

              <form.AppField name="confirmPassword">
                {(field) => (
                  <field.PasswordInputField
                    label="Confirm New Password"
                    placeholder="Confirm your new password"
                    required
                  />
                )}
              </form.AppField>

              <Group justify="flex-end" mt="md">
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Button type="submit" loading={isSubmitting}>
                      Update Password
                    </Button>
                  )}
                </form.Subscribe>
              </Group>
            </Stack>
          </form>
        </Card>

        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group justify="space-between" align="flex-start" mb="xs">
            <div>
              <Text fw={500}>Two-Factor Authentication</Text>
              <Text size="sm" c="dimmed" mt={4}>
                Add an extra layer of security to your account
              </Text>
            </div>
            <Button variant="light" size="sm" disabled>
              Coming Soon
            </Button>
          </Group>
        </Card>

        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group justify="space-between" align="flex-start" mb="xs">
            <div>
              <Text fw={500}>Active Sessions</Text>
              <Text size="sm" c="dimmed" mt={4}>
                Manage devices and sessions where you're signed in
              </Text>
            </div>
            <Button variant="light" size="sm" disabled>
              Coming Soon
            </Button>
          </Group>
        </Card>
      </Stack>
    </>
  );
}
