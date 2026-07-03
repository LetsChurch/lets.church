import { IconCheck, IconInfoCircle } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { Alert, Text } from '@/components/ui';
import { useAppForm } from '@/components/ui/form';
import { useTRPC } from '@/trpc/react';

const resetPasswordSearchSchema = z.object({
  token: z.string(),
});

export const Route = createFileRoute('/auth_/reset-password')({
  component: ResetPasswordRoute,
  validateSearch: resetPasswordSearchSchema,
  beforeLoad: async ({ context, search }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (hasSession) {
      throw redirect({ to: '/' });
    }

    // Validate that we have the required parameters
    try {
      resetPasswordSearchSchema.parse(search);
    } catch {
      throw redirect({ to: '/auth/login' });
    }
  },
});

function ResetPasswordRoute() {
  const { token } = Route.useSearch();
  const [error, setError] = useState<string | false>(false);
  const [success, setSuccess] = useState(false);
  const trpc = useTRPC();

  const resetPasswordMutation = useMutation(
    trpc.auth.completeResetPassword.mutationOptions({
      onSuccess: (data) => {
        if (data.error) {
          setError(
            typeof data.error === 'string' ? data.error : 'An error occurred',
          );
        } else {
          setSuccess(true);
        }
      },
      onError: (err) => {
        setError(
          err instanceof Error ? err.message : 'Failed to reset password',
        );
      },
    }),
  );

  const form = useAppForm({
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
    validators: {
      onChange: z
        .object({
          password: z.string().min(6, 'Password must be at least 6 characters'),
          confirmPassword: z.string().min(1, 'Please confirm your password'),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: 'Passwords do not match',
          path: ['confirmPassword'],
        }),
    },
    onSubmit: async ({ value }) => {
      resetPasswordMutation.mutate({
        token,
        password: value.password,
      });
    },
  });

  return (
    <div className="rounded-lg border-fancy-pants bg-white p-5 shadow-sm dark:bg-zinc-900">
      <Text size="lg" fw={500}>
        Reset your password
      </Text>

      {success ? (
        <Alert
          title="Password reset successful"
          icon={<IconCheck />}
          color="green"
          className="mt-4 mb-4"
        >
          Your password has been reset successfully. You can now log in with
          your new password.
        </Alert>
      ) : null}

      {error ? (
        <Alert
          title="Error"
          icon={<IconInfoCircle />}
          color="red"
          withCloseButton
          onClose={() => setError(false)}
          className="mt-4 mb-4"
        >
          {error}
        </Alert>
      ) : null}

      {!success ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          method="post"
        >
          <div className="flex flex-col gap-4">
            <Text size="sm" c="dimmed" className="mt-3">
              Enter your new password below.
            </Text>

            <form.AppField name="password">
              {(field) => (
                <field.PasswordInputField
                  label="New password"
                  placeholder="Enter new password"
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="confirmPassword">
              {(field) => (
                <field.PasswordInputField
                  label="Confirm password"
                  placeholder="Confirm new password"
                  required
                />
              )}
            </form.AppField>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <form.AppForm>
              <form.SubmitButton label="Reset password" />
            </form.AppForm>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <Link to="/auth/login">
            <Text size="sm" ta="center" c="blue" style={{ cursor: 'pointer' }}>
              Go to login
            </Text>
          </Link>
        </div>
      )}
    </div>
  );
}
