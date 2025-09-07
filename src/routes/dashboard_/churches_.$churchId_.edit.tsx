import { Container, Group, LoadingOverlay, Stack, Title } from '@mantine/core';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { showFailure, showSuccess } from '@/routes/-mantine';
import { ChurchForm } from '@/routes/dashboard_/-components/church-form';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/dashboard_/churches_/$churchId_/edit')({
  component: ChurchEditPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.churches.getChurchForEdit.queryOptions({
        churchId: params.churchId,
      }),
    );
    return {
      backNavigation: {
        label: 'Back to church',
        to: '/dashboard/churches/$churchId',
        params: { churchId: params.churchId },
      },
    };
  },
});

function ChurchEditPage() {
  const { churchId } = Route.useParams();
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: church } = useSuspenseQuery(
    trpc.dashboard.churches.getChurchForEdit.queryOptions({
      churchId,
    }),
  );

  const updateChurchMutation = useMutation(
    trpc.dashboard.churches.updateChurch.mutationOptions({
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
          message: 'Church updated successfully!',
        });

        await queryClient.invalidateQueries({
          queryKey: ['dashboard', 'churches'],
        });

        await router.navigate({
          to: '/dashboard/churches/$churchId',
          params: { churchId },
        });
      },
      onError: () => {
        showFailure({
          title: 'Error',
          message: 'Error updating church, please try again!',
        });
      },
    }),
  );

  const defaultValues = {
    churchId,
    name: church.name,
    description: church.description || '',
    websiteUrl: church.websiteUrl || '',
    primaryEmail: church.primaryEmail || '',
    primaryPhoneNumber: church.primaryPhoneNumber || '',
    tags: (church.tags as string[]) || [],
    associatedOrganizations: (church.associatedOrganizations as string[]) || [],
    associatedOrganizationsWithStatus:
      (church.associatedOrganizationsWithStatus as Array<{
        organizationId: string;
        upstreamApproved: boolean;
      }>) || [],
  };

  return (
    <Container size="md" py="md" pos="relative">
      <LoadingOverlay visible={updateChurchMutation.isPending} />

      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1}>Edit Church</Title>
          </div>
        </Group>

        <ChurchForm
          mode="edit"
          defaultValues={defaultValues}
          onSubmit={(data) =>
            updateChurchMutation.mutate({ ...data, churchId })
          }
          isSubmitting={updateChurchMutation.isPending}
          submitLabel="Update Church"
          showSlugField={false}
        />
      </Stack>
    </Container>
  );
}
