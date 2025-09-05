import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconList, IconPlus, IconTrash } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import clsx from 'clsx';
import { useAppMantineForm } from '@/components/mantine';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';
import styles from './-styles.module.css';

export const Route = createFileRoute(
  '/dashboard_/channels_/$channelId_/playlists',
)({
  component: PlaylistsPage,
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
      trpc.dashboard.channels.getChannelPlaylists.queryOptions({
        channelId: params.channelId,
      }),
    );
    return {
      backNavigation: {
        label: 'Channel Dashboard',
        to: '/dashboard/channels/$channelId',
        params: { channelId: params.channelId },
      },
    };
  },
});

function PlaylistsPage() {
  const params = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);

  const { data: playlists } = useSuspenseQuery(
    trpc.dashboard.channels.getChannelPlaylists.queryOptions({
      channelId: params.channelId,
    }),
  );

  const createPlaylistMutation = useMutation(
    trpc.dashboard.channels.createPlaylist.mutationOptions({
      onSuccess: async () => {
        notifications.show({
          title: 'Success',
          message: 'Playlist created successfully',
          color: 'green',
        });
        close();
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelPlaylists.queryKey({
            channelId: params.channelId,
          }),
        });
      },
      onError: (error) => {
        notifications.show({
          title: 'Error',
          message: error.message,
          color: 'red',
        });
      },
    }),
  );

  const deletePlaylistMutation = useMutation(
    trpc.dashboard.channels.deletePlaylist.mutationOptions({
      onSuccess: async () => {
        notifications.show({
          title: 'Success',
          message: 'Playlist deleted successfully',
          color: 'green',
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelPlaylists.queryKey({
            channelId: params.channelId,
          }),
        });
      },
      onError: (error) => {
        notifications.show({
          title: 'Error',
          message: error.message,
          color: 'red',
        });
      },
    }),
  );

  const form = useAppMantineForm({
    defaultValues: {
      title: '',
      type: 'PLAYLIST' as const,
    },
    onSubmit: async ({ value }) => {
      createPlaylistMutation.mutate({
        channelId: params.channelId,
        ...value,
      });
    },
  });

  const handleDeletePlaylist = async (playlistId: string) => {
    modals.openConfirmModal({
      title: 'Delete playlist',
      children:
        'Are you sure you want to delete this playlist? This action cannot be undone.',
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        deletePlaylistMutation.mutate({
          channelId: params.channelId,
          playlistId,
        });
      },
    });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Playlists</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={open}>
          Create Playlist
        </Button>
      </Group>

      <Stack gap="md">
        {playlists.map((playlist) => (
          <Card key={playlist.id} padding="lg" radius="md" withBorder>
            <Group justify="space-between" align="flex-start">
              <Stack gap="xs" style={{ flex: 1 }}>
                <Group gap="sm">
                  <IconList size={20} />
                  <Text fw={500} size="lg">
                    {playlist.title}
                  </Text>
                  <Badge
                    color={playlist.type === 'PLAYLIST' ? 'blue' : 'green'}
                  >
                    {playlist.type}
                  </Badge>
                </Group>
                <Group gap="md">
                  <Text size="sm" c="dimmed">
                    {playlist._count.uploads} uploads
                  </Text>
                  <Text size="sm" c="dimmed">
                    Created {formatDate(playlist.createdAt)}
                  </Text>
                </Group>
              </Stack>
              <Group gap="xs">
                <Button
                  variant="light"
                  size="sm"
                  renderRoot={(rootProps) => (
                    <Link
                      {...rootProps}
                      className={clsx(rootProps.className, styles.buttonLink)}
                      to="/dashboard/channels/$channelId/playlists/$playlistId"
                      params={{
                        channelId: params.channelId,
                        playlistId: playlist.id,
                      }}
                    >
                      Manage
                    </Link>
                  )}
                />
                <ActionIcon
                  color="red"
                  variant="light"
                  onClick={() => handleDeletePlaylist(playlist.id)}
                  loading={deletePlaylistMutation.isPending}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Group>
          </Card>
        ))}

        {playlists.length === 0 && (
          <Text ta="center" c="dimmed" py="xl">
            No playlists yet. Create your first playlist to get started.
          </Text>
        )}
      </Stack>

      <Modal opened={opened} onClose={close} title="Create New Playlist">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <Stack gap="md">
            <form.AppField name="title">
              {(field) => (
                <field.TextInputField
                  label="Title"
                  placeholder="Enter playlist title"
                  required
                />
              )}
            </form.AppField>
            <form.AppField name="type">
              {(field) => (
                <field.SelectField
                  label="Type"
                  data={[
                    { value: 'PLAYLIST', label: 'Playlist' },
                    { value: 'SERIES', label: 'Series' },
                  ]}
                />
              )}
            </form.AppField>
            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={createPlaylistMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
