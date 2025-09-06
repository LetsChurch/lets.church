import {
  Container,
  Group,
  LoadingOverlay,
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
import { ChannelForm } from '@/routes/dashboard_/-components/channel-form';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute('/dashboard_/channels_/$channelId_/edit')({
  component: ChannelEditPage,
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

  const defaultValues = {
    name: channel.name || '',
    slug: channel.slug || '',
    description: channel.description || '',
    visibility: channel.visibility,
  };

  return (
    <Container size="md" py="md" pos="relative">
      <LoadingOverlay visible={updateMutation.isPending} />

      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1}>Edit Channel</Title>
            <Text c="dimmed" size="sm">
              Update your channel information and settings
            </Text>
          </div>
        </Group>

        <ChannelForm
          mode="edit"
          defaultValues={defaultValues}
          onSubmit={(data) => updateMutation.mutate({ channelId, ...data })}
          isSubmitting={updateMutation.isPending}
          submitLabel="Save Changes"
        />
      </Stack>
    </Container>
  );
}
