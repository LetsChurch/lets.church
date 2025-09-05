import {
  Button,
  Container,
  Group,
  LoadingOverlay,
  Stack,
  Title,
} from '@mantine/core';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useAppMantineForm } from '@/components/mantine';
import { showFailure, showSuccess } from '@/routes/-mantine';
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

        // Invalidate and refetch church data
        await queryClient.invalidateQueries({
          queryKey: ['dashboard', 'churches'],
        });

        // Navigate back to church details
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

  const form = useAppMantineForm({
    defaultValues: {
      churchId,
      name: church.name,
      description: church.description || '',
      websiteUrl: church.websiteUrl || '',
      primaryEmail: church.primaryEmail || '',
      primaryPhoneNumber: church.primaryPhoneNumber || '',
    },
    onSubmit: async ({ value }) => {
      updateChurchMutation.mutate(value);
    },
  });

  return (
    <Container size="md" py="md" pos="relative">
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => <LoadingOverlay visible={isSubmitting} />}
      </form.Subscribe>

      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1}>Edit Church</Title>
          </div>
        </Group>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          method="post"
        >
          <Stack gap="lg">
            <form.AppField name="name">
              {(field) => (
                <field.TextInputField
                  label="Church Name"
                  placeholder="Enter church name"
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="description">
              {(field) => (
                <field.TextareaField
                  label="Description"
                  placeholder="Enter church description..."
                  minRows={3}
                  maxRows={6}
                />
              )}
            </form.AppField>

            <form.AppField name="websiteUrl">
              {(field) => (
                <field.TextInputField
                  label="Website URL"
                  placeholder="https://example.com"
                  type="url"
                />
              )}
            </form.AppField>

            <form.AppField name="primaryEmail">
              {(field) => (
                <field.TextInputField
                  label="Primary Email"
                  placeholder="contact@church.org"
                  type="email"
                />
              )}
            </form.AppField>

            <form.AppField name="primaryPhoneNumber">
              {(field) => (
                <field.TextInputField
                  label="Primary Phone Number"
                  placeholder="(555) 123-4567"
                  type="tel"
                />
              )}
            </form.AppField>

            <Group justify="flex-end" mt="md">
              <form.Subscribe selector={(state) => state.isDirty}>
                {(isDirty) => (
                  <>
                    <Button
                      variant="outline"
                      disabled={!isDirty}
                      onClick={() => form.reset()}
                    >
                      Reset
                    </Button>
                    <form.Subscribe selector={(state) => state.isSubmitting}>
                      {(isSubmitting) => (
                        <Button type="submit" loading={isSubmitting}>
                          Update Church
                        </Button>
                      )}
                    </form.Subscribe>
                  </>
                )}
              </form.Subscribe>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
