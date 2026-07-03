import { Autocomplete } from '@base-ui/react/autocomplete';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  IconGripVertical,
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
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';
import { ActionIcon, Badge, InputWrapper, Text, Title } from '@/components/ui';
import { modals } from '@/components/ui/confirm-modal';
import { notifications } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';
import { formatTime } from '@/util/format';

export const Route = createFileRoute('/_main/dashboard/admin_/featured')({
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
    ...trpc.search.hybridSearch.queryOptions({
      q: debouncedSearchValue,
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
    // The schema will automatically convert base58 IDs to UUIDs
    handleAddToFeatured(value);

    setTimeout(() => {
      setSearchValue(''); // Clear after current event loop
    }, 0);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <Title order={2}>Featured Media</Title>
        <Text size="sm" c="dimmed">
          Manage uploads that appear in the homepage hero carousel
        </Text>
      </div>

      <Autocomplete.Root
        items={autocompleteData}
        value={searchValue}
        onValueChange={(value) => setSearchValue(value)}
        mode="none"
        itemToStringValue={(item: { value: string; label: string }) =>
          item.label
        }
      >
        <InputWrapper label="Add Upload to Featured">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-secondary">
              <IconPlus size={16} />
            </span>
            <Autocomplete.Input
              placeholder="Search uploads to feature..."
              className="h-9 w-full rounded-md border border-gray-300 bg-transparent pr-9 pl-9 text-primary text-sm outline-none transition-colors placeholder:text-secondary focus:border-brand focus:ring-2 focus:ring-brand/25 dark:border-zinc-700"
            />
            <Autocomplete.Clear
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-secondary transition-colors hover:text-primary"
              aria-label="Clear"
            >
              <IconX size={16} />
            </Autocomplete.Clear>
          </div>
        </InputWrapper>
        <Autocomplete.Portal>
          <Autocomplete.Positioner sideOffset={4} className="z-50">
            <Autocomplete.Popup className="max-h-72 w-[var(--anchor-width)] overflow-y-auto rounded-lg border-fancy-pants bg-white p-1 shadow-xl dark:bg-zinc-900">
              <Autocomplete.List>
                {autocompleteData.map((item) => (
                  <Autocomplete.Item
                    key={item.value}
                    value={item}
                    onClick={() => handleAutocompleteSelect(item.value)}
                    className="cursor-pointer rounded-md px-3 py-2 text-primary text-sm outline-none transition-colors hover:bg-gray-100 data-highlighted:bg-gray-100 dark:data-highlighted:bg-zinc-800 dark:hover:bg-zinc-800"
                  >
                    {item.label}
                  </Autocomplete.Item>
                ))}
              </Autocomplete.List>
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      </Autocomplete.Root>

      {items.length === 0 ? (
        <Text ta="center" c="dimmed" className="py-8">
          No featured uploads yet. Search and add uploads to feature them on the
          homepage.
        </Text>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="featured">
            {(provided) => (
              <div
                className="flex flex-col gap-4"
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
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="overflow-hidden rounded-lg border-fancy-pants bg-white p-5 dark:bg-zinc-900"
                        style={{
                          ...provided.draggableProps.style,
                          opacity: snapshot.isDragging ? 0.8 : 1,
                          transform: snapshot.isDragging
                            ? `${provided.draggableProps.style?.transform} rotate(2deg)`
                            : provided.draggableProps.style?.transform,
                        }}
                      >
                        <div className="flex flex-nowrap items-center justify-start gap-4">
                          <div {...provided.dragHandleProps}>
                            <ActionIcon variant="subtle" color="gray" size="lg">
                              <IconGripVertical size={20} />
                            </ActionIcon>
                          </div>

                          <Link
                            to="/dashboard/channels/$channelId/uploads/$uploadId"
                            params={{
                              channelId: item.uploadRecord.channel.id,
                              uploadId: item.uploadRecord.id,
                            }}
                            className="flex flex-1 gap-4 text-inherit no-underline"
                          >
                            {item.uploadRecord.thumbnailUrl ? (
                              <img
                                src={item.uploadRecord.thumbnailUrl}
                                alt={item.uploadRecord.title || 'Untitled'}
                                width={120}
                                height={68}
                                className="rounded-sm object-cover"
                              />
                            ) : null}

                            <div style={{ flex: 1 }}>
                              <div className="mb-2.5 flex flex-wrap items-center justify-start gap-2.5">
                                <Text fw={500} size="sm">
                                  {item.uploadRecord.title || 'Untitled'}
                                </Text>
                                <Badge color="blue" size="sm">
                                  Featured
                                </Badge>
                              </div>

                              <Text size="xs" c="dimmed" lineClamp={2}>
                                {item.uploadRecord.description ||
                                  'No description'}
                              </Text>

                              <div className="mt-2.5 flex flex-wrap items-center justify-start gap-2.5">
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
                              </div>
                            </div>
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
    </div>
  );
}
