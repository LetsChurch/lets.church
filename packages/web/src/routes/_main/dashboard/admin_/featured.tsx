import { Autocomplete } from '@base-ui/react/autocomplete';
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

import { SortableItem, SortableList } from '@/components/sortable-list';
import { ActionIcon, Badge, InputWrapper, Text, Title } from '@/components/ui';
import { modals } from '@/components/ui/confirm-modal';
import { notifications } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';
import { formatTime } from '@/util/format';

import { FeaturedMediaSearchResult } from './-featured-media-search-result';

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

  const canSearch = debouncedSearchValue.trim().length >= 2;
  // Search for uploads to add (search across all public uploads)
  const { data: searchData, isLoading: isSearching } = useQuery({
    ...trpc.search.hybridSearch.queryOptions({
      q: debouncedSearchValue,
      limit: 20,
    }),
    enabled: canSearch,
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

  const handleReorder = (newItems: typeof items) => {
    setItems(newItems);

    // Update the order in the database
    reorderFeaturedUploadsMutation.mutate({
      uploadIds: newItems.map((item) => item.uploadRecord.id),
    });
  };

  const handleAddToFeatured = async (uploadId: string) => {
    addFeaturedUploadMutation.mutate({ uploadId });
  };

  const availableUploads = canSearch
    ? (searchData?.items ?? []).filter(
        (upload) =>
          !featuredUploads.some((item) => item.uploadRecord.id === upload.id),
      )
    : [];

  const autocompleteData = availableUploads.map((upload) => ({
    value: upload.id,
    label: upload.title || 'Untitled',
    description: upload.description,
    thumbnailUrl: upload.thumbnailUrl,
    channelName: upload.channel.name,
    lengthSeconds: upload.lengthSeconds,
    publishedAt: upload.publishedAt,
    viewCount: upload._count.uploadViews,
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
        itemToStringValue={(item) => item.label}
      >
        <InputWrapper label="Add Upload to Featured">
          <div className="relative">
            <span className="text-secondary pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <IconPlus size={16} />
            </span>
            <Autocomplete.Input
              placeholder="Search uploads to feature..."
              className="text-primary placeholder:text-secondary focus:border-brand focus:ring-brand/25 h-9 w-full rounded-md border border-gray-300 bg-transparent pr-9 pl-9 text-sm transition-colors outline-none focus:ring-2 dark:border-zinc-700"
            />
            <Autocomplete.Clear
              className="text-secondary hover:text-primary absolute inset-y-0 right-0 flex items-center pr-3 transition-colors"
              aria-label="Clear"
            >
              <IconX size={16} />
            </Autocomplete.Clear>
          </div>
        </InputWrapper>
        <Autocomplete.Portal>
          <Autocomplete.Positioner sideOffset={4} className="z-50">
            <Autocomplete.Popup className="border-fancy-pants bg-dashboard-surface max-h-96 w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] min-w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-lg p-1 shadow-xl">
              {searchValue.trim().length < 2 ? (
                <div className="text-secondary px-3 py-4 text-center text-sm">
                  Type at least 2 characters to search media
                </div>
              ) : isSearching ? (
                <div className="text-secondary px-3 py-4 text-center text-sm">
                  Searching media…
                </div>
              ) : (
                <>
                  <Autocomplete.Empty className="text-secondary px-3 py-4 text-center text-sm">
                    No available media found
                  </Autocomplete.Empty>
                  <Autocomplete.List>
                    {autocompleteData.map((item) => (
                      <Autocomplete.Item
                        key={item.value}
                        value={item}
                        onClick={() => handleAutocompleteSelect(item.value)}
                        className="hover:bg-brand/10 data-[highlighted]:border-brand/60 data-[highlighted]:bg-brand/15 cursor-pointer rounded-md border border-transparent p-2 transition-[background-color,border-color,box-shadow] outline-none data-[highlighted]:shadow-sm"
                      >
                        <FeaturedMediaSearchResult
                          title={item.label}
                          description={item.description}
                          thumbnailUrl={item.thumbnailUrl}
                          channelName={item.channelName}
                          lengthSeconds={item.lengthSeconds}
                          publishedAt={item.publishedAt}
                          viewCount={item.viewCount}
                        />
                      </Autocomplete.Item>
                    ))}
                  </Autocomplete.List>
                </>
              )}
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
        <SortableList
          items={items}
          getId={(item) => item.uploadRecord.id}
          onReorder={handleReorder}
          className="flex flex-col gap-4"
        >
          {(item) => (
            <SortableItem key={item.uploadRecord.id} id={item.uploadRecord.id}>
              {({ setNodeRef, style, attributes, listeners }) => (
                <div
                  ref={setNodeRef}
                  className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 dark:bg-zinc-900"
                  style={style}
                >
                  <div className="flex flex-nowrap items-center justify-start gap-4">
                    <div {...attributes} {...listeners}>
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
                          {item.uploadRecord.description || 'No description'}
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
            </SortableItem>
          )}
        </SortableList>
      )}
    </div>
  );
}
