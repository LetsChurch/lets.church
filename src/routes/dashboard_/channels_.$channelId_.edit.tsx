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
import { ChannelVisibility } from '@prisma/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { invariant } from 'es-toolkit';
import { z } from 'zod';
import { useAppMantineForm } from '@/components/mantine';
import db from '@/util/db';
import {
  hasValidSession,
  requireChannelAdminAccessMiddleware,
} from '../-functions';
import { showFailure, showSuccess } from '../-mantine';

const getChannelForEdit = createServerFn({ method: 'GET' })
  .middleware([requireChannelAdminAccessMiddleware])
  .validator(z.object({ channelId: z.string() }))
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    const channel = await db.channel.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        visibility: true,
        memberships: {
          select: {
            isAdmin: true,
            appUser: {
              select: {
                id: true,
              },
            },
          },
        },
      },
      where: {
        id: data.channelId,
        memberships: {
          some: {
            appUserId: context.session.appUser.id,
            isAdmin: true,
          },
        },
      },
    });

    if (!channel) {
      throw new Error('Channel not found or insufficient permissions');
    }

    const userMembership = channel.memberships.find(
      (m) => m.appUser.id === context.session?.appUser.id,
    );

    return {
      ...channel,
      userMembership,
    } as const;
  });

const formSchema = z.object({
  name: z.string().min(1, 'Channel name is required'),
  slug: z
    .string()
    .min(1, 'Channel slug is required')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Slug can only contain letters, numbers, underscores, and hyphens',
    ),
  description: z.string(),
  visibility: z.enum(
    Object.values(ChannelVisibility) as [
      ChannelVisibility,
      ...ChannelVisibility[],
    ],
  ),
});

const updateChannelSchema = formSchema.and(
  z.object({
    channelId: z.string(),
  }),
);

const updateChannel = createServerFn({
  method: 'POST',
  response: 'data',
})
  .middleware([requireChannelAdminAccessMiddleware])
  .validator(updateChannelSchema)
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    const channel = await db.channel.findFirst({
      select: {
        id: true,
        memberships: {
          select: {
            isAdmin: true,
            appUser: {
              select: {
                id: true,
              },
            },
          },
        },
      },
      where: {
        id: data.channelId,
        memberships: {
          some: {
            appUserId: context.session.appUser.id,
            isAdmin: true,
          },
        },
      },
    });

    if (!channel) {
      throw new Error('Channel not found or insufficient permissions');
    }

    const userMembership = channel.memberships.find(
      (m) => m.appUser.id === context.session?.appUser.id,
    );

    if (!userMembership?.isAdmin) {
      throw new Error('Insufficient permissions to edit this channel');
    }

    const updatedChannel = await db.channel.update({
      where: { id: data.channelId },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        visibility: data.visibility,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        visibility: true,
      },
    });

    return { success: true, channel: updatedChannel };
  });

const channelEditQueryOptions = (channelId: string) => ({
  queryKey: ['dashboard', 'channels', channelId, 'edit'],
  queryFn: () => getChannelForEdit({ data: { channelId } }),
});

export const Route = createFileRoute('/dashboard_/channels_/$channelId_/edit')({
  component: ChannelEditPage,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient }, params }) => {
    const data = await queryClient.ensureQueryData(
      channelEditQueryOptions(params.channelId),
    );
    return {
      data,
      backNavigation: {
        label: 'Back to channel',
        to: '/dashboard/channels/$channelId',
        params: { channelId: params.channelId },
      },
    };
  },
});

function ChannelEditPage() {
  const { data: channel } = Route.useLoaderData();
  const { channelId } = Route.useParams();
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: updateChannel,
    onSuccess: async () => {
      showSuccess({
        message: 'Channel updated successfully!',
      });

      await queryClient.invalidateQueries({
        queryKey: ['dashboard', 'channels', channelId],
      });

      await queryClient.invalidateQueries({
        queryKey: ['dashboard', 'channels'],
      });
    },
    onError: (error: Error) => {
      showFailure({
        message: error.message || 'Failed to update channel',
      });
    },
  });

  const form = useAppMantineForm({
    defaultValues: {
      name: channel.name || '',
      slug: channel.slug || '',
      description: channel.description || '',
      visibility: channel.visibility,
    },
    validators: {
      onChange: formSchema,
    },
    onSubmit: async ({ value }) => {
      updateMutation.mutate({
        data: {
          channelId,
          ...value,
        },
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
