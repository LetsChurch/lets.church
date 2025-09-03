import {
  Button,
  Container,
  Group,
  LoadingOverlay,
  Radio,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAppMantineForm } from '@/components/mantine';
import { channelFormSchema } from '@/schemas/dashboard';
import { useTRPC } from '@/trpc/react';
import { hasValidSession } from '../-functions';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute('/dashboard_/channels_/$channelId_/edit')({
  component: ChannelEditPage,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.channels.getChannelForEdit.queryOptions({
        channelId: params.channelId,
      }),
    );
    return {
      backNavigation: {
        label: 'Back to channel',
        to: '/dashboard/channels/$channelId',
        params: { channelId: params.channelId },
      },
    };
  },
});

function ChannelEditPage() {
  const { channelId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: channel } = useSuspenseQuery(
    trpc.dashboard.channels.getChannelForEdit.queryOptions({
      channelId,
    }),
  );

  const updateMutation = useMutation(
    trpc.dashboard.channels.updateChannel.mutationOptions({
      onSuccess: async () => {
        showSuccess({
          message: 'Channel updated successfully!',
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelDetails.queryKey({
            channelId,
          }),
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannels.queryKey(),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to update channel',
        });
      },
    }),
  );

  const form = useAppMantineForm({
    defaultValues: {
      name: channel.name || '',
      slug: channel.slug || '',
      description: channel.description || '',
      visibility: channel.visibility,
    },
    validators: {
      onChange: channelFormSchema,
    },
    onSubmit: async ({ value }) => {
      updateMutation.mutate({
        channelId,
        ...value,
      });
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
            <Title order={1}>Edit Channel</Title>
            <Text c="dimmed" size="sm">
              Update your channel information and settings
            </Text>
          </div>
        </Group>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <Stack gap="md">
            <form.AppField name="name">
              {(field) => (
                <field.TextInputField
                  label="Channel Name (required)"
                  placeholder="Enter channel name"
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="slug">
              {(field) => (
                <Stack gap="xs">
                  <field.TextInputField
                    label="Channel Slug (required)"
                    placeholder="channel-slug"
                    required
                  />
                  <Text size="xs" c="dimmed">
                    This will be used in your channel URL. Only letters,
                    numbers, underscores, and hyphens are allowed.
                  </Text>
                </Stack>
              )}
            </form.AppField>

            <form.AppField name="description">
              {(field) => (
                <field.TextareaField
                  label="Description"
                  placeholder="Describe your channel"
                  minRows={4}
                  maxRows={8}
                  autosize
                />
              )}
            </form.AppField>

            <Stack gap="md">
              <Text fw={500} size="sm">
                Visibility
              </Text>
              <form.AppField name="visibility">
                {(field) => (
                  <field.RadioGroupField>
                    <Stack gap="sm">
                      <Radio
                        value="PUBLIC"
                        label={
                          <div>
                            <Text fw={500}>Public</Text>
                            <Text size="xs" c="dimmed">
                              Anyone can discover and view your channel
                            </Text>
                          </div>
                        }
                      />
                      <Radio
                        value="PRIVATE"
                        label={
                          <div>
                            <Text fw={500}>Private</Text>
                            <Text size="xs" c="dimmed">
                              Only channel members can view content
                            </Text>
                          </div>
                        }
                      />
                      <Radio
                        value="UNLISTED"
                        label={
                          <div>
                            <Text fw={500}>Unlisted</Text>
                            <Text size="xs" c="dimmed">
                              Not discoverable, but accessible with a link
                            </Text>
                          </div>
                        }
                      />
                    </Stack>
                  </field.RadioGroupField>
                )}
              </form.AppField>
            </Stack>

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
                    <Button
                      type="submit"
                      disabled={!isDirty}
                      loading={updateMutation.isPending}
                    >
                      Save Changes
                    </Button>
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
