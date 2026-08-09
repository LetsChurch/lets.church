import { IconList, IconPlus, IconTrash } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import { LcModal, ModalHeader } from '@/components/lc-modal';
import { ActionIcon, Badge, Button, Text, Title } from '@/components/ui';
import { modals } from '@/components/ui/confirm-modal';
import { useAppForm } from '@/components/ui/form';
import { notifications } from '@/components/ui/notifications';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

export const Route = createFileRoute(
  '/_main/dashboard/channels_/$channelId_/playlists',
)({
  component: PlaylistsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
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

  const form = useAppForm({
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Title order={2}>Playlists</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={open}>
          Create Playlist
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {playlists.map((playlist) => (
          <div
            key={playlist.id}
            className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div style={{ flex: 1 }} className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-start gap-3">
                  <IconList size={20} />
                  <Text fw={500} size="lg">
                    {playlist.title}
                  </Text>
                  <Badge
                    color={playlist.type === 'PLAYLIST' ? 'blue' : 'green'}
                  >
                    {playlist.type}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center justify-start gap-4">
                  <Text size="sm" c="dimmed">
                    {playlist._count.uploads} uploads
                  </Text>
                  <Text size="sm" c="dimmed">
                    Created {formatDate(playlist.createdAt)}
                  </Text>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-start gap-2.5">
                <Button
                  variant="light"
                  size="sm"
                  component={Link}
                  to="/dashboard/channels/$channelId/playlists/$playlistId"
                  params={{
                    channelId: params.channelId,
                    playlistId: playlist.id,
                  }}
                  className="content-center"
                >
                  Manage
                </Button>
                <ActionIcon
                  color="red"
                  variant="light"
                  onClick={() => handleDeletePlaylist(playlist.id)}
                  loading={deletePlaylistMutation.isPending}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </div>
            </div>
          </div>
        ))}

        {playlists.length === 0 && (
          <Text ta="center" c="dimmed" className="py-8">
            No playlists yet. Create your first playlist to get started.
          </Text>
        )}
      </div>

      <LcModal.Root
        open={opened}
        onOpenChange={(o) => {
          if (!o) close();
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Create New Playlist" />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <div className="flex flex-col gap-4">
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
                <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
                  <Button variant="subtle" onClick={close}>
                    Cancel
                  </Button>
                  <form.Subscribe selector={(state) => state.isValid}>
                    {(isValid) => (
                      <Button
                        type="submit"
                        loading={createPlaylistMutation.isPending}
                        disabled={!isValid}
                      >
                        Create
                      </Button>
                    )}
                  </form.Subscribe>
                </div>
              </div>
            </form>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>
    </div>
  );
}
