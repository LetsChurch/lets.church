import { Alert, Button, Group, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTRPC } from '@/trpc/react';

export default function EmailVerificationBanner() {
  const trpc = useTRPC();
  const _queryClient = useQueryClient();
  const [resendSuccess, setResendSuccess] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const { data: unverifiedEmail, isLoading } = useQuery({
    ...trpc.common.getUnverifiedEmail.queryOptions(),
    // Refetch every 5 minutes in case the user verifies in another tab
    refetchInterval: 5 * 60 * 1000,
  });

  const resendMutation = useMutation({
    ...trpc.common.resendVerificationEmail.mutationOptions(),
    onSuccess: () => {
      setResendSuccess(true);
      // Reset success message after 5 seconds
      timeoutRef.current = setTimeout(() => setResendSuccess(false), 5000);
    },
  });

  if (isLoading || !unverifiedEmail) {
    return null;
  }

  return (
    <Alert
      color="orange"
      icon={<IconAlertCircle />}
      styles={{
        root: {
          borderRadius: 0,
          borderLeft: 'none',
          borderRight: 'none',
          borderTop: 'none',
        },
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">
          {resendSuccess ? (
            <span>
              Verification email sent to{' '}
              <strong>{unverifiedEmail.email}</strong>. Please check your inbox.
            </span>
          ) : (
            <span>
              Please verify your email address{' '}
              <strong>{unverifiedEmail.email}</strong> to access all features.
            </span>
          )}
        </Text>
        <Button
          size="xs"
          variant="light"
          color="orange"
          onClick={() => resendMutation.mutate()}
          loading={resendMutation.isPending}
          disabled={resendSuccess}
        >
          {resendSuccess ? 'Email Sent' : 'Resend Email'}
        </Button>
      </Group>
    </Alert>
  );
}
