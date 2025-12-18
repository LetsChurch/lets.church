import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  ActionIcon,
  Autocomplete,
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
import {
  IconEdit,
  IconGripVertical,
  IconLink,
  IconPlus,
  IconTrash,
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
import { useAppMantineForm } from '@/components/mantine';
import { idTranslator } from '@/schemas/common';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

export const Route = createFileRoute(
  '/dashboard_/channels_/$channelId_/playlists_/$playlistId',
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

  const editForm = useAppMantineForm({
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

  const handleAutocompleteSelect = (value: string) => {
    const selectedUpload = autocompleteData.find(
      (option) => option.label === value,
    );

    if (selectedUpload) {
      handleAddToPlaylist(selectedUpload.value);
    }

    setTimeout(() => {
      setSearchValue(''); // Clear after current event loop
    }, 0);
  };

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
    <Stack gap="lg">
      <Group justify="space-between">
        <Stack gap="xs">
          <Group gap="sm">
            <Title order={2}>{playlist.title}</Title>
            <Badge color={playlist.type === 'PLAYLIST' ? 'blue' : 'green'}>
              {playlist.type}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            {playlist.uploads.length} uploads • Created{' '}
            {formatDate(playlist.createdAt)}
          </Text>
        </Stack>
        <Group>
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
        </Group>
      </Group>

      {
        <Autocomplete
          label="Add Upload to Playlist"
          placeholder="Search uploads to add..."
          data={autocompleteData.map((option) => option.label)}
          value={searchValue}
          onChange={setSearchValue}
          onOptionSubmit={handleAutocompleteSelect}
          leftSection={<IconPlus size={16} />}
          clearable
          limit={10}
          comboboxProps={{
            transitionProps: { transition: 'pop', duration: 200 },
          }}
        />
      }

      {items.length === 0 ? (
        <Text ta="center" c="dimmed" py="xl">
          No uploads in this playlist yet. Add some uploads to get started.
        </Text>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="playlist">
            {(provided) => (
              <Stack
                gap="md"
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
                      <Card
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        padding="lg"
                        radius="md"
                        withBorder
                        style={{
                          ...provided.draggableProps.style,
                          opacity: snapshot.isDragging ? 0.8 : 1,
                        }}
                      >
                        <Group gap="md">
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            {...provided.dragHandleProps}
                          >
                            <IconGripVertical size={16} />
                          </ActionIcon>

                          <Stack gap="xs" style={{ flex: 1 }}>
                            <Text fw={500}>
                              {item.upload.title || 'Untitled'}
                            </Text>
                            {item.upload.description && (
                              <Text size="sm" c="dimmed" lineClamp={2}>
                                {item.upload.description}
                              </Text>
                            )}
                            <Group gap="md">
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
                            </Group>
                          </Stack>

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
                        </Group>
                      </Card>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </Stack>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Edit Playlist Modal */}
      <Modal opened={editOpened} onClose={closeEdit} title="Edit Playlist">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            editForm.handleSubmit();
          }}
        >
          <Stack gap="md">
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
            <Group justify="flex-end" mt="md">
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
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
