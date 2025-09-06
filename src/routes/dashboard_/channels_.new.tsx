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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useAppMantineForm } from '@/components/mantine';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute('/dashboard_/channels_/new')({
  component: CreateChannelPage,
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
        label: 'My Channels',
        to: '/dashboard/channels',
      },
    };
  },
});

function CreateChannelPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const createMutation = useMutation(
    trpc.dashboard.channels.createChannel.mutationOptions({
      onSuccess: async (data) => {
        showSuccess({
          message: 'Channel created successfully!',
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannels.queryKey(),
        });

        navigate({
          to: '/dashboard/channels/$channelId',
          params: { channelId: data.id },
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to create channel',
        });
      },
    }),
  );

  const form = useAppMantineForm({
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      visibility: 'PUBLIC' as const,
    },
    onSubmit: async ({ value }) => {
      createMutation.mutate(value);
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
            <Title order={1}>Create Channel</Title>
            <Text c="dimmed" size="sm">
              Create a new channel to organize and share your content
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
              <Button
                variant="outline"
                onClick={() =>
                  navigate({
                    to: '/dashboard/channels',
                  })
                }
              >
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Create Channel
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
