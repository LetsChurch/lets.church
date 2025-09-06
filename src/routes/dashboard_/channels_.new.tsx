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
import { ChannelForm } from '@/routes/dashboard_/-components/channel-form';
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

  const defaultValues = {
    name: '',
    slug: '',
    description: '',
    visibility: 'PUBLIC' as const,
  };

  return (
    <Container size="md" py="md" pos="relative">
      <LoadingOverlay visible={createMutation.isPending} />

      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1}>Create Channel</Title>
            <Text c="dimmed" size="sm">
              Create a new channel to organize and share your content
            </Text>
          </div>
        </Group>

        <ChannelForm
          mode="create"
          defaultValues={defaultValues}
          onSubmit={createMutation.mutate}
          isSubmitting={createMutation.isPending}
          submitLabel="Create Channel"
          onCancel={() =>
            navigate({
              to: '/dashboard/channels',
            })
          }
        />
      </Stack>
    </Container>
  );
}
