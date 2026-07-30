import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { Button, Text, Title } from '@/components/ui';
import { useAppForm } from '@/components/ui/form';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { passwordChangeSchema } from '@/schemas/account';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/dashboard/account_/security')({
  component: SecurityPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(trpc.account.getSecurity.queryOptions());
    return {
      backNavigation: {
        label: 'Account Settings',
        to: '/dashboard/account',
      },
    };
  },
});

function SecurityPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: security } = useSuspenseQuery(
    trpc.account.getSecurity.queryOptions(),
  );

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
          message: security.hasPassword
            ? 'Password changed successfully.'
            : 'Your password is set.',
        });
        form.reset();
        await queryClient.invalidateQueries(
          trpc.account.getSecurity.queryFilter(),
        );
      },
      onError: () => {
        showFailure({
          title: 'Error',
          message: 'Error changing password, please try again!',
        });
      },
    }),
  );

  const form = useAppForm({
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
      <Title order={1} className="mb-5">
        Password & Security
      </Title>

      <div className="flex max-w-[600px] flex-col gap-5">
        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <Text fw={500} className="mb-4">
            {security.hasPassword ? 'Change password' : 'Set a password'}
          </Text>
          {!security.hasPassword ? (
            <Text size="sm" c="dimmed" className="mb-4">
              You currently sign in by email. Setting a password gives you
              another way to access your account.
            </Text>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            method="post"
          >
            <div className="flex flex-col gap-4">
              {security.hasPassword ? (
                <form.AppField name="currentPassword">
                  {(field) => (
                    <field.PasswordInputField
                      label="Current password"
                      placeholder="Enter your current password"
                      required
                    />
                  )}
                </form.AppField>
              ) : null}

              <form.AppField name="newPassword">
                {(field) => (
                  <field.PasswordInputField
                    label="New password"
                    placeholder="Enter your new password"
                    required
                  />
                )}
              </form.AppField>

              <form.AppField name="confirmPassword">
                {(field) => (
                  <field.PasswordInputField
                    label="Confirm new password"
                    placeholder="Confirm your new password"
                    required
                  />
                )}
              </form.AppField>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Button type="submit" loading={isSubmitting}>
                      {security.hasPassword
                        ? 'Update password'
                        : 'Set password'}
                    </Button>
                  )}
                </form.Subscribe>
              </div>
            </div>
          </form>
        </div>

        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <Text fw={500}>Two-Factor Authentication</Text>
              <Text size="sm" c="dimmed" className="mt-[4px]">
                Add an extra layer of security to your account
              </Text>
            </div>
            <Button variant="light" size="sm" disabled>
              Coming Soon
            </Button>
          </div>
        </div>

        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <Text fw={500}>Active Sessions</Text>
              <Text size="sm" c="dimmed" className="mt-[4px]">
                Manage devices and sessions where you're signed in
              </Text>
            </div>
            <Button variant="light" size="sm" disabled>
              Coming Soon
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
