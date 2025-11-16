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
  Box,
  Card,
  Group,
  Image,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useTRPC } from '@/trpc/react';
import { formatTime } from '@/util/format';

export const Route = createFileRoute('/dashboard_/admin_/featured')({
  component: FeaturedUploadsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.admin.getFeaturedUploads.queryOptions(),
    );

    return {
      backNavigation: {
        label: 'Admin Dashboard',
        to: '/dashboard/admin',
      },
    };
  },
});

function FeaturedUploadsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearchValue] = useDebounce(searchValue, 200);

  const { data: featuredUploads } = useSuspenseQuery(
    trpc.dashboard.admin.getFeaturedUploads.queryOptions(),
  );

  // Search for uploads to add (search across all public uploads)
  const { data: searchData } = useQuery({
    ...trpc.search.performSearch.queryOptions({
      q: debouncedSearchValue,
      focus: 'media',
      limit: 20,
    }),
    enabled: debouncedSearchValue.length >= 2,
  });

  const [items, setItems] = useState(featuredUploads);

  const addFeaturedUploadMutation = useMutation(
    trpc.dashboard.admin.addFeaturedUpload.mutationOptions({
      onSuccess: async () => {
        notifications.show({
          title: 'Success',
          message: 'Upload added to featured',
          color: 'green',
        });

        // Invalidate and refetch
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getFeaturedUploads.queryKey(),
        });

        const updatedFeatured = await queryClient.fetchQuery(
          trpc.dashboard.admin.getFeaturedUploads.queryOptions(),
        );

        setItems(updatedFeatured);
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

  const removeFeaturedUploadMutation = useMutation(
    trpc.dashboard.admin.removeFeaturedUpload.mutationOptions({
      onSuccess: async () => {
        notifications.show({
          title: 'Success',
          message: 'Upload removed from featured',
          color: 'green',
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getFeaturedUploads.queryKey(),
        });

        const updatedFeatured = await queryClient.fetchQuery(
          trpc.dashboard.admin.getFeaturedUploads.queryOptions(),
        );

        setItems(updatedFeatured);
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

  const reorderFeaturedUploadsMutation = useMutation(
    trpc.dashboard.admin.reorderFeaturedUploads.mutationOptions({
      onSuccess: async () => {
        notifications.show({
          title: 'Success',
          message: 'Featured uploads reordered successfully',
          color: 'green',
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getFeaturedUploads.queryKey(),
        });

        const updatedFeatured = await queryClient.fetchQuery(
          trpc.dashboard.admin.getFeaturedUploads.queryOptions(),
        );

        setItems(updatedFeatured);
      },
      onError: (error) => {
        notifications.show({
          title: 'Error',
          message: error.message,
          color: 'red',
        });
        // Reset order on error
        setItems(featuredUploads);
      },
    }),
  );

  const handleRemoveFromFeatured = async (uploadId: string) => {
    modals.openConfirmModal({
      title: 'Remove from featured',
      children: 'Are you sure you want to remove this upload from featured?',
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        removeFeaturedUploadMutation.mutate({ uploadId });
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
    reorderFeaturedUploadsMutation.mutate({
      uploadIds: newItems.map((item) => item.uploadRecord.id),
    });
  };

  const handleAddToFeatured = async (uploadId: string) => {
    addFeaturedUploadMutation.mutate({ uploadId });
  };

  // Filter out uploads that are already featured
  const availableUploads =
    debouncedSearchValue.length >= 2 && searchData?.items
      ? (
          searchData.items as Array<{ id: string; title?: string | null }>
        ).filter(
          (upload) =>
            !featuredUploads.some((item) => item.uploadRecord.id === upload.id),
        )
      : [];

  const autocompleteData = availableUploads.map((upload) => ({
    value: upload.id,
    label: upload.title || 'Untitled',
  }));

  const handleAutocompleteSelect = (value: string) => {
    // When using object data with value/label, onOptionSubmit receives the value
    handleAddToFeatured(value);

    setTimeout(() => {
      setSearchValue(''); // Clear after current event loop
    }, 0);
  };

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={2}>Featured Media</Title>
        <Text size="sm" c="dimmed">
          Manage uploads that appear in the homepage hero carousel
        </Text>
      </Stack>

      <Autocomplete
        label="Add Upload to Featured"
        placeholder="Search uploads to feature..."
        data={autocompleteData}
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

      {items.length === 0 ? (
        <Text ta="center" c="dimmed" py="xl">
          No featured uploads yet. Search and add uploads to feature them on the
          homepage.
        </Text>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="featured">
            {(provided) => (
              <Stack
                gap="md"
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {items.map((item, index) => (
                  <Draggable
                    key={item.uploadRecord.id}
                    draggableId={item.uploadRecord.id}
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
                          transform: snapshot.isDragging
                            ? `${provided.draggableProps.style?.transform} rotate(2deg)`
                            : provided.draggableProps.style?.transform,
                        }}
                      >
                        <Group wrap="nowrap" gap="md">
                          <Box {...provided.dragHandleProps}>
                            <ActionIcon variant="subtle" color="gray" size="lg">
                              <IconGripVertical size={20} />
                            </ActionIcon>
                          </Box>

                          <Link
                            to="/dashboard/channels/$channelId/uploads/$uploadId"
                            params={{
                              channelId: item.uploadRecord.channel.id,
                              uploadId: item.uploadRecord.id,
                            }}
                            style={{
                              textDecoration: 'none',
                              color: 'inherit',
                              flex: 1,
                              display: 'flex',
                              gap: 'var(--mantine-spacing-md)',
                            }}
                          >
                            {item.uploadRecord.thumbnailUrl ? (
                              <Image
                                src={item.uploadRecord.thumbnailUrl}
                                alt={item.uploadRecord.title || 'Untitled'}
                                w={120}
                                h={68}
                                radius="sm"
                              />
                            ) : null}

                            <Box style={{ flex: 1 }}>
                              <Group gap="xs" mb="xs">
                                <Text fw={500} size="sm">
                                  {item.uploadRecord.title || 'Untitled'}
                                </Text>
                                <Badge color="blue" size="sm">
                                  Featured
                                </Badge>
                              </Group>

                              <Text size="xs" c="dimmed" lineClamp={2}>
                                {item.uploadRecord.description ||
                                  'No description'}
                              </Text>

                              <Group gap="xs" mt="xs">
                                <Text size="xs" c="dimmed">
                                  {item.uploadRecord.channel.name}
                                </Text>
                                {item.uploadRecord.lengthSeconds ? (
                                  <>
                                    <Text size="xs" c="dimmed">
                                      •
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                      {formatTime(
                                        item.uploadRecord.lengthSeconds * 1000,
                                      )}
                                    </Text>
                                  </>
                                ) : null}
                              </Group>
                            </Box>
                          </Link>

                          <ActionIcon
                            color="red"
                            variant="subtle"
                            size="lg"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFromFeatured(item.uploadRecord.id);
                            }}
                          >
                            <IconTrash size={20} />
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
    </Stack>
  );
}
