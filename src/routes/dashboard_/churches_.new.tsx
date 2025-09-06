import {
  Container,
  Group,
  LoadingOverlay,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { ChurchForm } from '@/routes/dashboard_/-components/church-form';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute('/dashboard_/churches_/new')({
  component: CreateChurchPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async () => {
    return {
      backNavigation: {
        label: 'Churches',
        to: '/dashboard/churches',
      },
    };
  },
});

function CreateChurchPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const createMutation = useMutation(
    trpc.dashboard.churches.createChurch.mutationOptions({
      onSuccess: async (data) => {
        showSuccess({
          message: 'Church created successfully!',
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurches.queryKey(),
        });

        navigate({
          to: '/dashboard/churches/$churchId',
          params: { churchId: data.id },
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to add church',
        });
      },
    }),
  );

  const defaultValues = {
    name: '',
    slug: '',
    description: '',
    websiteUrl: '',
    primaryEmail: '',
    primaryPhoneNumber: '',
    tags: [] as string[],
  };

  return (
    <Container size="md" py="md" pos="relative">
      <LoadingOverlay visible={createMutation.isPending} />

      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1}>Add Church</Title>
            <Text c="dimmed" size="sm">
              Create a new church profile to manage your congregation
            </Text>
          </div>
        </Group>

        <ChurchForm
          mode="create"
          defaultValues={defaultValues}
          onSubmit={createMutation.mutate}
          isSubmitting={createMutation.isPending}
          submitLabel="Add Church"
          showSlugField={true}
          onCancel={() =>
            navigate({
              to: '/dashboard/churches',
            })
          }
        />
      </Stack>
    </Container>
  );
}
