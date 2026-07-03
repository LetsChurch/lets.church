import { Combobox } from '@base-ui/react/combobox';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  IconEdit,
  IconGripVertical,
  IconLink,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import {
  ActionIcon,
  Badge,
  Button,
  InputWrapper,
  Text,
  Title,
} from '@/components/ui';
import { modals } from '@/components/ui/confirm-modal';
import { useAppForm } from '@/components/ui/form';
import { controlClasses } from '@/components/ui/input';
import { notifications } from '@/components/ui/notifications';
import { useDisclosure } from '@/hooks/use-disclosure';
import { idTranslator } from '@/schemas/common';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import { formatDate } from '@/util/format';

export const Route = createFileRoute(
  '/_main/dashboard/channels_/$channelId_/playlists_/$playlistId',
)({
  component: PlaylistDetailsPage,
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
      trpc.dashboard.channels.getPlaylistDetails.queryOptions({
        channelId: params.channelId,
        playlistId: params.playlistId,
      }),
    );

    return {
      backNavigation: {
        label: 'Playlists',
        to: '/dashboard/channels/$channelId/playlists',
        params: { channelId: params.channelId },
      },
    };
  },
});

function PlaylistDetailsPage() {
  const params = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editOpened, { open: openEdit, close: closeEdit }] =
    useDisclosure(false);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearchValue] = useDebounce(searchValue, 200);

  const { data: playlist } = useSuspenseQuery(
    trpc.dashboard.channels.getPlaylistDetails.queryOptions({
      channelId: params.channelId,
      playlistId: params.playlistId,
    }),
  );

  const { data: searchData } = useQuery({
    ...trpc.dashboard.channels.getChannelUploads.queryOptions({
      channelId: params.channelId,
      page: 1,
      limit: 100,
      search: debouncedSearchValue,
    }),
    enabled: debouncedSearchValue.length >= 2,
  });

  const [items, setItems] = useState(playlist.uploads);

  const updatePlaylistMutation = useMutation(
    trpc.dashboard.channels.updatePlaylist.mutationOptions({
      onSuccess: async () => {
        notifications.show({
          title: 'Success',
          message: 'Playlist updated successfully',
          color: 'green',
        });

        closeEdit();

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getPlaylistDetails.queryKey({
            channelId: params.channelId,
            playlistId: params.playlistId,
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

  const addToPlaylistMutation = useMutation(
    trpc.dashboard.channels.addToPlaylist.mutationOptions({
      onSuccess: async () => {
        notifications.show({
          title: 'Success',
          message: 'Upload added to playlist',
          color: 'green',
        });

        // Invalidate and refetch the playlist details
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getPlaylistDetails.queryKey({
            channelId: params.channelId,
            playlistId: params.playlistId,
          }),
        });

        // Refetch the playlist data to update local state
        const updatedPlaylist = await queryClient.fetchQuery(
          trpc.dashboard.channels.getPlaylistDetails.queryOptions({
            channelId: params.channelId,
            playlistId: params.playlistId,
          }),
        );

        // Update the items state with the new playlist data
        setItems(updatedPlaylist.uploads);
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

  const removeFromPlaylistMutation = useMutation(
    trpc.dashboard.channels.removeFromPlaylist.mutationOptions({
      onSuccess: async () => {
        notifications.show({
          title: 'Success',
          message: 'Upload removed from playlist',
          color: 'green',
        });

        // Invalidate and refetch the playlist details
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getPlaylistDetails.queryKey({
            channelId: params.channelId,
            playlistId: params.playlistId,
          }),
        });

        // Refetch the playlist data to update local state
        const updatedPlaylist = await queryClient.fetchQuery(
          trpc.dashboard.channels.getPlaylistDetails.queryOptions({
            channelId: params.channelId,
            playlistId: params.playlistId,
          }),
        );

        // Update the items state with the new playlist data
        setItems(updatedPlaylist.uploads);
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

  const reorderPlaylistMutation = useMutation(
    trpc.dashboard.channels.reorderPlaylist.mutationOptions({
      onSuccess: async () => {
        notifications.show({
          title: 'Success',
          message: 'Playlist reordered successfully',
          color: 'green',
        });

        // Invalidate and refetch the playlist details
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getPlaylistDetails.queryKey({
            channelId: params.channelId,
            playlistId: params.playlistId,
          }),
        });

        // Refetch the playlist data to update local state
        const updatedPlaylist = await queryClient.fetchQuery(
          trpc.dashboard.channels.getPlaylistDetails.queryOptions({
            channelId: params.channelId,
            playlistId: params.playlistId,
          }),
        );

        // Update the items state with the new playlist data
        setItems(updatedPlaylist.uploads);
      },
      onError: (error) => {
        notifications.show({
          title: 'Error',
          message: error.message,
          color: 'red',
        });
        // Reset order on error
        setItems(playlist.uploads);
      },
    }),
  );

  const editForm = useAppForm({
    defaultValues: {
      title: playlist.title,
      type: playlist.type,
    },
    onSubmit: async ({ value }) => {
      updatePlaylistMutation.mutate({
        channelId: params.channelId,
        playlistId: params.playlistId,
        ...value,
      });
    },
  });

  const handleRemoveFromPlaylist = async (uploadId: string) => {
    modals.openConfirmModal({
      title: 'Remove upload from playlist',
      children:
        'Are you sure you want to remove this upload from the playlist?',
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        removeFromPlaylistMutation.mutate({
          channelId: params.channelId,
          playlistId: params.playlistId,
          uploadId,
        });
      },
    });
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const newItems = Array.from(items);
    const [reorderedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, reorderedItem);

    setItems(newItems);

    // Update the order in the database
    reorderPlaylistMutation.mutate({
      channelId: params.channelId,
      playlistId: params.playlistId,
      uploadIds: newItems.map((item) => item.upload.id),
    });
  };

  const handleAddToPlaylist = async (uploadId: string) => {
    addToPlaylistMutation.mutate({
      channelId: params.channelId,
      playlistId: params.playlistId,
      uploadId,
    });
  };

  // Filter out uploads that are already in the playlist, only show if there's a search term
  const availableUploads =
    debouncedSearchValue.length >= 2 && searchData
      ? searchData.uploads.filter(
          (upload) =>
            !playlist.uploads.some((item) => item.upload.id === upload.id),
        )
      : [];

  const autocompleteData = availableUploads.map((upload) => ({
    value: upload.id,
    label: upload.title || 'Untitled',
    upload,
  }));

  const handleCopyPlaylistLink = async () => {
    const shortId = idTranslator.fromUUID(playlist.id);
    const isSeries = playlist.type === 'SERIES';
    const path = isSeries ? 'series' : 'playlist';
    const url = `${window.location.origin}/${path}/${shortId}`;
    const typeLabel = isSeries ? 'Series' : 'Playlist';

    try {
      await navigator.clipboard.writeText(url);
      notifications.show({
        title: 'Success',
        message: `${typeLabel} link copied to clipboard`,
        color: 'green',
      });
    } catch (_error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to copy link to clipboard',
        color: 'red',
      });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-start gap-3">
            <Title order={2}>{playlist.title}</Title>
            <Badge color={playlist.type === 'PLAYLIST' ? 'blue' : 'green'}>
              {playlist.type}
            </Badge>
          </div>
          <Text size="sm" c="dimmed">
            {playlist.uploads.length} uploads • Created{' '}
            {formatDate(playlist.createdAt)}
          </Text>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-4">
          <Button
            variant="light"
            leftSection={<IconLink size={16} />}
            onClick={handleCopyPlaylistLink}
          >
            Copy Link
          </Button>
          <Button
            variant="light"
            leftSection={<IconEdit size={16} />}
            onClick={openEdit}
          >
            Edit
          </Button>
        </div>
      </div>

      <InputWrapper label="Add Upload to Playlist">
        {/* Resolve the picked upload by its id (via the item object), not by its
            title — many uploads share a title (e.g. "Untitled"), so a
            label-based lookup would add the wrong one. */}
        <Combobox.Root
          items={autocompleteData}
          value={null}
          inputValue={searchValue}
          onInputValueChange={(value: string) => setSearchValue(value)}
          onValueChange={(item: { value: string; label: string } | null) => {
            if (item) {
              handleAddToPlaylist(item.value);
              // Clear after the current event loop so the input resets for the
              // next search rather than showing the just-added upload.
              setTimeout(() => setSearchValue(''), 0);
            }
          }}
          itemToStringLabel={(item: { value: string; label: string }) =>
            item.label
          }
          // Items are already filtered server-side by `searchUploads`; disable
          // Base UI's built-in client filter so it doesn't double-filter (the
          // server matches more than titles, so a title-only client pass would
          // wrongly hide valid results).
          filter={null}
        >
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted">
              <IconPlus size={16} />
            </span>
            <Combobox.Input
              placeholder="Search uploads to add..."
              className={cn(controlClasses(false), 'pr-9 pl-9')}
            />
            <Combobox.Clear
              aria-label="Clear"
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted transition-colors hover:text-primary"
            >
              <IconX size={16} />
            </Combobox.Clear>
          </div>
          <Combobox.Portal>
            <Combobox.Positioner sideOffset={4} className="z-50">
              <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-lg border-fancy-pants bg-white p-1 shadow-lg dark:bg-zinc-900">
                <Combobox.Empty className="px-3 py-2 text-secondary text-sm empty:hidden">
                  No uploads found
                </Combobox.Empty>
                <Combobox.List>
                  {(item: { value: string; label: string }) => (
                    <Combobox.Item
                      key={item.value}
                      value={item}
                      className="flex cursor-default items-center rounded px-3 py-1.5 text-primary text-sm data-[highlighted]:bg-brand/10"
                    >
                      {item.label}
                    </Combobox.Item>
                  )}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>
      </InputWrapper>

      {items.length === 0 ? (
        <Text ta="center" c="dimmed" className="py-8">
          No uploads in this playlist yet. Add some uploads to get started.
        </Text>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="playlist">
            {(provided) => (
              <div
                className="flex flex-col gap-4"
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {items.map((item, index) => (
                  <Draggable
                    key={item.upload.id}
                    draggableId={item.upload.id}
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="overflow-hidden rounded-xl border-fancy-pants bg-white p-5 dark:bg-zinc-900"
                        style={{
                          ...provided.draggableProps.style,
                          opacity: snapshot.isDragging ? 0.8 : 1,
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-start gap-4">
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            {...provided.dragHandleProps}
                          >
                            <IconGripVertical size={16} />
                          </ActionIcon>

                          <div
                            style={{ flex: 1 }}
                            className="flex flex-col gap-2.5"
                          >
                            <Text fw={500}>
                              {item.upload.title || 'Untitled'}
                            </Text>
                            {item.upload.description && (
                              <Text size="sm" c="dimmed" lineClamp={2}>
                                {item.upload.description}
                              </Text>
                            )}
                            <div className="flex flex-wrap items-center justify-start gap-4">
                              <Badge size="xs" color="gray">
                                {item.upload.visibility}
                              </Badge>
                              <Text size="xs" c="dimmed">
                                {formatDate(item.upload.createdAt)}
                              </Text>
                              {item.upload.lengthSeconds && (
                                <Text size="xs" c="dimmed">
                                  {Math.floor(item.upload.lengthSeconds / 60)}:
                                  {Math.floor(item.upload.lengthSeconds % 60)
                                    .toString()
                                    .padStart(2, '0')}
                                </Text>
                              )}
                            </div>
                          </div>

                          <ActionIcon
                            color="red"
                            variant="light"
                            onClick={() =>
                              handleRemoveFromPlaylist(item.upload.id)
                            }
                            loading={removeFromPlaylistMutation.isPending}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Edit Playlist Modal */}
      <LcModal.Root
        open={editOpened}
        onOpenChange={(o) => {
          if (!o) closeEdit();
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Edit Playlist" />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editForm.handleSubmit();
              }}
            >
              <div className="flex flex-col gap-4">
                <editForm.AppField name="title">
                  {(field) => (
                    <field.TextInputField
                      label="Title"
                      placeholder="Enter playlist title"
                      required
                    />
                  )}
                </editForm.AppField>
                <editForm.AppField name="type">
                  {(field) => (
                    <field.SelectField
                      label="Type"
                      data={[
                        { value: 'PLAYLIST', label: 'Playlist' },
                        { value: 'SERIES', label: 'Series' },
                      ]}
                    />
                  )}
                </editForm.AppField>
                <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
                  <Button variant="subtle" onClick={closeEdit}>
                    Cancel
                  </Button>
                  <editForm.Subscribe selector={(state) => state.isValid}>
                    {(isValid) => (
                      <Button
                        type="submit"
                        loading={updatePlaylistMutation.isPending}
                        disabled={!isValid}
                      >
                        Save Changes
                      </Button>
                    )}
                  </editForm.Subscribe>
                </div>
              </div>
            </form>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>
    </div>
  );
}
