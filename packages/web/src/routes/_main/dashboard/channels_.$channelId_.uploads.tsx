import type { UploadLicense, UploadVisibility } from '@letschurch/db/types';
import { useStore } from '@nanostores/react';
import {
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconCube3dSphere,
  IconDownload,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconPhoto,
  IconRss,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconSelector,
  IconUpload,
} from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  ClientOnly,
  createFileRoute,
  redirect,
  useNavigate,
} from '@tanstack/react-router';
import { invariant } from 'es-toolkit';
import { map } from 'nanostores';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import {
  DataTableSearch,
  DataTableToolbar,
} from '@/components/dashboard/data-table';
import { HeaderActions } from '@/components/dashboard/header-actions';
import {
  emptyImportSeries,
  ImportSeriesFields,
  type ImportSeriesState,
  importSeriesInput,
  isImportSeriesComplete,
} from '@/components/dashboard/import-series-fields';
import { LcMenu, MenuItemButton, OverflowMenu } from '@/components/lc-menu';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import {
  Badge,
  Button,
  Checkbox,
  Select,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@/components/ui';
import { Dropzone } from '@/components/ui/dropzone';
import {
  notifications,
  showFailure,
  showSuccess,
} from '@/components/ui/notifications';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDisclosure } from '@/hooks/use-disclosure';
import { trpcClient, useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import { formatDate, formatTime } from '@/util/format';
import { doMultipartUpload } from '@/util/multipart-upload';
import {
  extractVideoThumbnailCandidates,
  type VideoThumbnailCandidate,
} from '@/util/video-thumbnails';

export const $uploadProgress = map<Record<string, number | undefined>>({});
export const $deletedUploads = map<Record<string, true>>({});

export type LocalVideoThumbnailCandidate = VideoThumbnailCandidate & {
  url: string;
};

type LocalVideoThumbnailState =
  | { requestId: number; status: 'loading' }
  | {
      requestId: number;
      status: 'ready';
      candidates: LocalVideoThumbnailCandidate[];
    }
  | { requestId: number; status: 'error'; message: string };

export const $localVideoThumbnails = map<
  Record<string, LocalVideoThumbnailState | undefined>
>({});

let localVideoThumbnailRequestId = 0;
const localVideoThumbnailConsumers = new Map<string, number>();

function trackLocalVideoThumbnails(
  uploadId: string,
  promise: Promise<VideoThumbnailCandidate[]>,
) {
  const requestId = ++localVideoThumbnailRequestId;
  $localVideoThumbnails.setKey(uploadId, { requestId, status: 'loading' });

  void promise
    .then((candidates) => {
      if ($localVideoThumbnails.get()[uploadId]?.requestId !== requestId) {
        return;
      }

      $localVideoThumbnails.setKey(uploadId, {
        requestId,
        status: 'ready',
        candidates: candidates.map((candidate) => ({
          ...candidate,
          url: URL.createObjectURL(candidate.file),
        })),
      });
    })
    .catch((error) => {
      if ($localVideoThumbnails.get()[uploadId]?.requestId !== requestId) {
        return;
      }

      console.error('Failed to generate video thumbnails:', error);
      $localVideoThumbnails.setKey(uploadId, {
        requestId,
        status: 'error',
        message:
          'We could not preview frames from this video. Generated thumbnails will appear after processing.',
      });
    });
}

function clearLocalVideoThumbnails(uploadId: string) {
  const state = $localVideoThumbnails.get()[uploadId];
  if (state?.status === 'ready') {
    for (const candidate of state.candidates) {
      URL.revokeObjectURL(candidate.url);
    }
  }
  $localVideoThumbnails.setKey(uploadId, undefined);
}

export function retainLocalVideoThumbnails(uploadId: string) {
  localVideoThumbnailConsumers.set(
    uploadId,
    (localVideoThumbnailConsumers.get(uploadId) ?? 0) + 1,
  );

  return () => {
    const remaining = (localVideoThumbnailConsumers.get(uploadId) ?? 1) - 1;
    if (remaining > 0) {
      localVideoThumbnailConsumers.set(uploadId, remaining);
      return;
    }

    localVideoThumbnailConsumers.delete(uploadId);
    // Deferring cleanup keeps React Strict Mode's development-only effect
    // teardown/re-setup from discarding candidates while the page is mounted.
    queueMicrotask(() => {
      if (!localVideoThumbnailConsumers.has(uploadId)) {
        clearLocalVideoThumbnails(uploadId);
      }
    });
  };
}

export const Route = createFileRoute(
  '/_main/dashboard/channels_/$channelId_/uploads',
)({
  component: ChannelUploadsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  validateSearch: z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(20),
    search: z.string().optional(),
    sort: z
      .enum(['title', 'visibility', 'views', 'createdAt'])
      .default('createdAt'),
    direction: z.enum(['asc', 'desc']).default('desc'),
    upload: z.boolean().optional(),
  }),
  loaderDeps: ({ search }) => ({
    page: search.page,
    limit: search.limit,
    search: search.search,
    sort: search.sort,
    direction: search.direction,
  }),
  loader: async ({
    context: { queryClient, trpc },
    params,
    deps: { page, limit, search, sort, direction },
  }) => {
    const data = await queryClient.ensureQueryData(
      trpc.dashboard.channels.getChannelUploads.queryOptions({
        channelId: params.channelId,
        page,
        limit,
        search,
        sort,
        direction,
      }),
    );
    return {
      backNavigation: {
        label: data.channel.name,
        to: `/dashboard/channels/${params.channelId}`,
      },
    };
  },
});

type UploadSort = 'title' | 'visibility' | 'views' | 'createdAt';
type SortDirection = 'asc' | 'desc';

function SortableUploadHeader({
  column,
  direction,
  label,
  sort,
  onSort,
}: {
  column: UploadSort;
  direction: SortDirection;
  label: string;
  sort: UploadSort;
  onSort: (column: UploadSort) => void;
}) {
  const isSorted = sort === column;

  return (
    <Table.Th
      aria-sort={
        isSorted ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="hover:bg-dashboard-accent-soft focus-visible:ring-brand/40 -mx-2 flex min-h-8 w-[calc(100%+1rem)] items-center gap-1.5 rounded-md px-2 text-left outline-none focus-visible:ring-2"
      >
        <span>{label}</span>
        {isSorted ? (
          direction === 'asc' ? (
            <IconChevronUp
              aria-hidden="true"
              className="text-brand"
              size={14}
            />
          ) : (
            <IconChevronDown
              aria-hidden="true"
              className="text-brand"
              size={14}
            />
          )
        ) : (
          <IconSelector
            aria-hidden="true"
            className="text-muted opacity-50"
            size={14}
          />
        )}
      </button>
    </Table.Th>
  );
}

function ChannelUploadsPage() {
  const search = Route.useSearch();
  const params = Route.useParams();
  const navigate = useNavigate();
  const deletedUploads = useStore($deletedUploads);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data } = useSuspenseQuery(
    trpc.dashboard.channels.getChannelUploads.queryOptions({
      channelId: params.channelId,
      page: search.page,
      limit: search.limit,
      search: search.search,
      sort: search.sort,
      direction: search.direction,
    }),
  );

  const { data: currentUser } = useSuspenseQuery(
    trpc.common.getCurrentUser.queryOptions(),
  );

  const { channel, uploads, pagination } = data;
  const isChannelAdmin = channel.userMembership?.isAdmin ?? false;
  const isSiteAdmin = currentUser.role === 'ADMIN';
  const isAdmin = isChannelAdmin || isSiteAdmin;
  const canEdit = isAdmin || (channel.userMembership?.canEdit ?? false);
  const canUpload = isAdmin || (channel.userMembership?.canUpload ?? false);
  const canDelete = isAdmin; // Only channel admins and site admins can delete
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const currentFileRef = useRef<File | null>(null);
  const localThumbnailExtractionRef = useRef<{
    abortController: AbortController;
    promise: Promise<VideoThumbnailCandidate[]>;
  } | null>(null);
  const [uploadToDelete, setUploadToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const resetPreparedUpload = useCallback(() => {
    localThumbnailExtractionRef.current?.abortController.abort();
    localThumbnailExtractionRef.current = null;
    currentFileRef.current = null;
    setCurrentFile(null);
  }, []);

  const uploadIds = uploads.map((upload) => upload.id);
  const [selection, setSelection] = useState<string[]>([]);
  const handlers = {
    isAllSelected: () =>
      uploadIds.length > 0 && uploadIds.every((id) => selection.includes(id)),
    isSomeSelected: () =>
      selection.length > 0 && selection.length < uploadIds.length,
    resetSelection: () => setSelection([]),
    setSelection: (ids: string[]) => setSelection(ids),
    toggle: (id: string) =>
      setSelection((s) =>
        s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
      ),
  };
  const handleSort = (column: UploadSort) => {
    const defaultDirection: SortDirection =
      column === 'title' || column === 'visibility' ? 'asc' : 'desc';
    const direction =
      search.sort === column
        ? search.direction === 'asc'
          ? 'desc'
          : 'asc'
        : defaultDirection;

    handlers.resetSelection();
    navigate({
      to: '.',
      search: {
        page: 1,
        limit: search.limit,
        search: search.search,
        sort: column,
        direction,
      },
    });
  };

  // Debounced search
  const [searchValue, setSearchValue] = useState(search.search ?? '');
  const [debouncedSearch] = useDebouncedValue(searchValue, 300);

  // Update local state when URL search param changes (e.g., browser back/forward)
  useEffect(() => {
    setSearchValue(search.search ?? '');
  }, [search.search]);

  // Navigate when debounced search value changes
  useEffect(() => {
    if (debouncedSearch !== (search.search ?? '')) {
      navigate({
        to: '.',
        search: {
          page: 1,
          limit: search.limit,
          search: debouncedSearch || undefined,
          sort: search.sort,
          direction: search.direction,
        },
      });
    }
  }, [
    debouncedSearch,
    search.limit,
    search.sort,
    search.direction,
    navigate,
    search.search,
  ]);

  const createUploadMutation = useMutation(
    trpc.dashboard.channels.createUploadRecord.mutationOptions({
      onSuccess: async (uploadId) => {
        const file = currentFileRef.current;
        invariant(file, 'Missing upload file');
        const localThumbnailExtraction = localThumbnailExtractionRef.current;
        localThumbnailExtractionRef.current = null;

        if (localThumbnailExtraction) {
          trackLocalVideoThumbnails(uploadId, localThumbnailExtraction.promise);
        }

        $uploadProgress.setKey(uploadId, 0);
        const navPromise = navigate({
          to: '/dashboard/channels/$channelId/uploads/$uploadId',
          params: { channelId: channel.id, uploadId },
        });

        try {
          const { urls, partSize, s3UploadKey, s3UploadId } =
            await trpcClient.dashboard.channels.createMultipartUpload.mutate({
              channelId: channel.id,
              targetId: uploadId,
              uploadMimeType: file.type,
              postProcess: 'media',
              bytes: file.size,
            });

          const mpu = doMultipartUpload(file, urls, partSize);

          mpu.onProgress((progress) =>
            $uploadProgress.setKey(uploadId, progress),
          );

          const etags = await mpu;

          $uploadProgress.setKey(uploadId, undefined);

          await trpcClient.dashboard.channels.finalizeMultipartUpload.mutate({
            channelId: channel.id,
            s3UploadKey: s3UploadKey,
            s3UploadId: s3UploadId,
            s3PartETags: etags,
          });

          await navPromise;
        } catch (error) {
          $uploadProgress.setKey(uploadId, undefined);
          console.error('Failed to upload file:', error);
          showFailure({
            message:
              error instanceof Error ? error.message : 'Failed to upload file',
          });
        }
        closeUploadModal();
        currentFileRef.current = null;
        setCurrentFile(null);
      },
      onError: (error) => {
        console.error('Failed to create upload record:', error);
        resetPreparedUpload();
        showFailure({
          message:
            error instanceof Error
              ? error.message
              : 'Failed to create upload record',
        });
      },
    }),
  );

  const deleteUploadMutation = useMutation(
    trpc.dashboard.channels.deleteUploadRecord.mutationOptions({
      onSuccess: ({ uploadId }) => {
        $deletedUploads.setKey(uploadId, true);
        showSuccess({ message: 'Upload deletion started successfully' });
        setUploadToDelete(null);
      },
      onError: (error) => {
        console.error('Failed to delete upload:', error);
        showFailure({
          message:
            error instanceof Error ? error.message : 'Failed to delete upload',
        });
      },
    }),
  );

  const bulkDeleteMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      const promises = uploadIds.map((uploadId) =>
        trpcClient.dashboard.channels.deleteUploadRecord.mutate({
          channelId: channel.id,
          uploadId,
        }),
      );
      return Promise.all(promises);
    },
    onSuccess: (results) => {
      results.forEach(({ uploadId }) => {
        $deletedUploads.setKey(uploadId, true);
      });
      showSuccess({
        message: `${results.length} upload(s) deletion started successfully`,
      });
      setShowBulkDeleteModal(false);
      handlers.resetSelection();
    },
    onError: (error) => {
      console.error('Failed to bulk delete uploads:', error);
      showFailure({
        message:
          error instanceof Error ? error.message : 'Failed to delete uploads',
      });
    },
  });

  const bulkSetVisibilityMutation = useMutation(
    trpc.dashboard.channels.bulkSetVisibility.mutationOptions({
      onSuccess: ({ updatedCount, visibility }) => {
        showSuccess({
          message: `${updatedCount} upload(s) visibility updated to ${visibility.toLowerCase()}`,
        });
        handlers.resetSelection();
        queryClient.invalidateQueries(
          trpc.dashboard.channels.getChannelUploads.queryOptions({
            channelId: params.channelId,
            page: search.page,
            limit: search.limit,
            search: search.search,
            sort: search.sort,
            direction: search.direction,
          }),
        );
      },
      onError: (error) => {
        console.error('Failed to bulk set visibility:', error);
        showFailure({
          message:
            error instanceof Error
              ? error.message
              : 'Failed to update visibility',
        });
      },
    }),
  );

  const toggleFeaturedMutation = useMutation(
    trpc.dashboard.admin.toggleFeaturedUpload.mutationOptions({
      onSuccess: ({ isFeatured }) => {
        showSuccess({
          message: isFeatured
            ? 'Upload added to featured!'
            : 'Upload removed from featured',
        });

        queryClient.invalidateQueries(
          trpc.dashboard.channels.getChannelUploads.queryOptions({
            channelId: params.channelId,
            page: search.page,
            limit: search.limit,
            search: search.search,
            sort: search.sort,
            direction: search.direction,
          }),
        );

        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getFeaturedUploads.queryKey(),
        });
      },
      onError: (error) => {
        console.error('Failed to toggle featured:', error);
        showFailure({
          message:
            error instanceof Error
              ? error.message
              : 'Failed to toggle featured',
        });
      },
    }),
  );

  const downloadOriginalMutation = useMutation(
    trpc.dashboard.channels.getOriginalDownloadUrl.mutationOptions({
      onSuccess: ({ url }) => {
        window.open(url, '_blank');
      },
      onError: (error) => {
        showFailure({
          message:
            error instanceof Error
              ? error.message
              : 'Failed to get download URL',
        });
      },
    }),
  );

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'PUBLIC':
        return <IconEye size={16} />;
      case 'PRIVATE':
        return <IconEyeOff size={16} />;
      default:
        return <IconEye size={16} stroke={1} />;
    }
  };

  const getVisibilityColor = (visibility: string) => {
    switch (visibility) {
      case 'PUBLIC':
        return 'green';
      case 'PRIVATE':
        return 'red';
      case 'UNLISTED':
        return 'orange';
      default:
        return 'gray';
    }
  };

  const [
    uploadModalOpened,
    { open: openUploadModal, close: closeUploadModal },
  ] = useDisclosure();

  const [
    importModalOpened,
    { open: openImportModal, close: closeImportModal },
  ] = useDisclosure();

  const [
    bulkImportModalOpened,
    { open: openBulkImportModal, close: closeBulkImportModal },
  ] = useDisclosure();
  const [bulkImportFile, setBulkImportFile] = useState<File | null>(null);
  const [bulkImportSeries, setBulkImportSeries] =
    useState<ImportSeriesState>(emptyImportSeries);

  const [
    feedImportModalOpened,
    { open: openFeedImportModal, close: closeFeedImportModal },
  ] = useDisclosure();
  const [feedImportForm, setFeedImportForm] = useState<{
    url: string;
    // FEED → the feed's declared license, else the channel default
    license: UploadLicense | 'FEED';
    series: ImportSeriesState;
  }>({ url: '', license: 'FEED', series: emptyImportSeries });

  // Auto-open upload modal when navigating here with ?upload=true
  useEffect(() => {
    if (search.upload && canUpload) {
      openUploadModal();
      navigate({
        to: '.',
        search: {
          page: search.page,
          limit: search.limit,
          search: search.search,
          sort: search.sort,
          direction: search.direction,
        },
        replace: true,
      });
    }
  }, [
    search.upload,
    canUpload,
    openUploadModal,
    navigate,
    search.page,
    search.limit,
    search.sort,
    search.direction,
    search.search,
  ]);

  const [importFormData, setImportFormData] = useState({
    url: '',
    title: '',
    description: '',
    license: channel.defaultUploadLicense ?? 'STANDARD',
    visibility: channel.defaultUploadVisibility ?? 'PUBLIC',
    publishedAt: new Date(),
    userCommentsEnabled: channel.defaultUploadCommentsEnabled ?? true,
    trimSilence: false,
  });

  const handleDrop = ([file]: File[]) => {
    localThumbnailExtractionRef.current?.abortController.abort();
    localThumbnailExtractionRef.current = null;
    currentFileRef.current = file;
    setCurrentFile(file);

    if (file.type.startsWith('video/')) {
      const abortController = new AbortController();
      const promise = extractVideoThumbnailCandidates(file, {
        signal: abortController.signal,
      });
      // The upload-record request can fail before the promise is transferred to
      // the media page. Mark early rejection as observed while preserving it for
      // the inline status handler attached after the record is created.
      void promise.catch(() => undefined);
      localThumbnailExtractionRef.current = {
        abortController,
        promise,
      };
    }

    createUploadMutation.mutate({
      channelId: channel.id,
      originalFileName: file.name,
    });
  };

  const importMediaMutation = useMutation(
    trpc.dashboard.channels.importMedia.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Import Started',
          message: 'Media import is in progress',
          color: 'blue',
        });
        closeImportModal();
        setImportFormData({
          url: '',
          title: '',
          description: '',
          license: channel.defaultUploadLicense ?? 'STANDARD',
          visibility: channel.defaultUploadVisibility ?? 'PUBLIC',
          publishedAt: new Date(),
          userCommentsEnabled: channel.defaultUploadCommentsEnabled ?? true,
          trimSilence: false,
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to start import',
          color: 'red',
        });
      },
    }),
  );

  const handleImportMedia = () => {
    importMediaMutation.mutate({
      channelId: channel.id,
      ...importFormData,
    });
  };

  const bulkImportMutation = useMutation(
    trpc.dashboard.channels.bulkImportMedia.mutationOptions({
      onSuccess: ({ itemCount, seriesId }) => {
        notifications.show({
          title: 'Bulk import started',
          message: `${itemCount.toLocaleString()} media items were queued for import.`,
          color: 'green',
        });
        closeBulkImportModal();
        setBulkImportFile(null);
        setBulkImportSeries(emptyImportSeries);
        if (seriesId) {
          void queryClient.invalidateQueries({
            queryKey: trpc.dashboard.channels.getChannelPlaylists.queryKey({
              channelId: channel.id,
            }),
          });
        }
      },
      onError: (error) => {
        notifications.show({
          title: 'Could not start bulk import',
          message: error.message,
          color: 'red',
        });
      },
    }),
  );

  const handleOpenBulkImport = () => {
    setBulkImportFile(null);
    setBulkImportSeries(emptyImportSeries);
    openBulkImportModal();
  };

  const feedImportMutation = useMutation(
    trpc.dashboard.channels.importFeed.mutationOptions({
      onSuccess: ({ seriesId }) => {
        notifications.show({
          title: 'Feed import started',
          message:
            'Every item in the feed will be queued for import. This can take a few minutes to appear.',
          color: 'green',
        });
        closeFeedImportModal();
        setFeedImportForm({
          url: '',
          license: 'FEED',
          series: emptyImportSeries,
        });
        if (seriesId) {
          void queryClient.invalidateQueries({
            queryKey: trpc.dashboard.channels.getChannelPlaylists.queryKey({
              channelId: channel.id,
            }),
          });
        }
      },
      onError: (error) => {
        notifications.show({
          title: 'Could not start feed import',
          message: error.message,
          color: 'red',
        });
      },
    }),
  );

  const handleFeedImport = () => {
    feedImportMutation.mutate({
      channelId: channel.id,
      url: feedImportForm.url.trim(),
      ...(feedImportForm.license !== 'FEED'
        ? { license: feedImportForm.license }
        : {}),
      series: importSeriesInput(feedImportForm.series),
    });
  };

  const handleBulkImport = async () => {
    if (!bulkImportFile) return;
    if (bulkImportFile.size > 64 * 1024 * 1024) {
      notifications.show({
        title: 'CSV file is too large',
        message: 'Choose a CSV file no larger than 64 MiB.',
        color: 'red',
      });
      return;
    }

    try {
      bulkImportMutation.mutate({
        channelId: channel.id,
        filename: bulkImportFile.name,
        csv: await bulkImportFile.text(),
        series: importSeriesInput(bulkImportSeries),
      });
    } catch {
      notifications.show({
        title: 'Could not read CSV file',
        message: 'Choose the file again and retry.',
        color: 'red',
      });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title order={1}>Uploads</Title>
          <Text c="dimmed">
            {channel.name} • {pagination.totalCount} total uploads
          </Text>
        </div>

        <HeaderActions
          menuLabel="More upload actions"
          actions={[
            canUpload && {
              key: 'upload',
              label: 'Upload',
              icon: <IconUpload size={16} />,
              variant: 'filled',
              onClick: openUploadModal,
            },
            isSiteAdmin && {
              key: 'import-url',
              label: 'Import URL',
              icon: <IconDownload size={16} />,
              color: 'blue',
              onClick: openImportModal,
            },
            isSiteAdmin && {
              key: 'import-feed',
              label: 'Import Feed',
              icon: <IconRss size={16} />,
              color: 'blue',
              onClick: openFeedImportModal,
            },
            isSiteAdmin && {
              key: 'bulk-import',
              label: 'Bulk Import CSV',
              icon: <IconUpload size={16} />,
              color: 'blue',
              onClick: handleOpenBulkImport,
            },
          ]}
        />
      </div>

      {selection.length > 0 ? (
        <div className="rounded-md border border-blue-300 bg-blue-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Text size="sm" fw={500}>
              {selection.length} upload{selection.length > 1 ? 's' : ''}{' '}
              selected
            </Text>
            <div className="flex flex-wrap items-center justify-start gap-3">
              {canDelete && (
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => setShowBulkDeleteModal(true)}
                  loading={bulkDeleteMutation.isPending}
                >
                  Delete Selected
                </Button>
              )}
              {canEdit && (
                <LcMenu.Root>
                  <LcMenu.Trigger
                    render={(props) => (
                      <Button
                        {...props}
                        size="xs"
                        variant="light"
                        rightSection={<IconChevronDown size={14} />}
                        loading={bulkSetVisibilityMutation.isPending}
                      >
                        Set Visibility
                      </Button>
                    )}
                  />

                  <LcMenu.Portal>
                    <LcMenu.Positioner sideOffset={4}>
                      <LcMenu.Popup>
                        <div className="text-secondary px-3 py-1.5 text-xs">
                          Change visibility for {selection.length} upload
                          {selection.length > 1 ? 's' : ''}
                        </div>
                        <Tooltip
                          label="Visible to everyone and appears in search results"
                          position="left"
                          withArrow
                        >
                          <MenuItemButton
                            icon={<IconEye size={16} />}
                            onClick={() => {
                              bulkSetVisibilityMutation.mutate({
                                channelId: channel.id,
                                uploadIds: selection,
                                visibility: 'PUBLIC',
                              });
                            }}
                          >
                            Public
                          </MenuItemButton>
                        </Tooltip>
                        <Tooltip
                          label="Only visible to people with the link, won't appear in searches"
                          position="left"
                          withArrow
                        >
                          <MenuItemButton
                            icon={<IconEye size={16} stroke={1} />}
                            onClick={() => {
                              bulkSetVisibilityMutation.mutate({
                                channelId: channel.id,
                                uploadIds: selection,
                                visibility: 'UNLISTED',
                              });
                            }}
                          >
                            Unlisted
                          </MenuItemButton>
                        </Tooltip>
                        <Tooltip
                          label="Only visible to you and channel members"
                          position="left"
                          withArrow
                        >
                          <MenuItemButton
                            icon={<IconEyeOff size={16} />}
                            onClick={() => {
                              bulkSetVisibilityMutation.mutate({
                                channelId: channel.id,
                                uploadIds: selection,
                                visibility: 'PRIVATE',
                              });
                            }}
                          >
                            Private
                          </MenuItemButton>
                        </Tooltip>
                      </LcMenu.Popup>
                    </LcMenu.Positioner>
                  </LcMenu.Portal>
                </LcMenu.Root>
              )}
              <Button
                size="xs"
                variant="default"
                onClick={() => {
                  handlers.resetSelection();
                }}
              >
                Clear Selection
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <LcModal.Root
        open={uploadModalOpened}
        onOpenChange={(o) => {
          if (!o && !createUploadMutation.isPending) {
            closeUploadModal();
            resetPreparedUpload();
          }
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="2xl">
            <ModalHeader title="Upload Media" />
            <Dropzone
              onDrop={handleDrop}
              accept={{
                'video/*': ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'],
                'audio/*': ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a'],
              }}
              multiple={false}
              loading={createUploadMutation.isPending}
              className="h-[200px]"
            >
              <div
                style={{ minHeight: 220, pointerEvents: 'none' }}
                className="flex flex-wrap items-center justify-center gap-8"
              >
                <Dropzone.Accept>
                  <IconUpload size={52} stroke={1.5} />
                </Dropzone.Accept>
                <Dropzone.Reject>
                  <IconPhoto size={52} stroke={1.5} />
                </Dropzone.Reject>
                <Dropzone.Idle>
                  <IconUpload size={52} stroke={1.5} />
                </Dropzone.Idle>

                <div>
                  <Text size="xl">
                    {currentFile
                      ? currentFile.name
                      : 'Drag and drop media files to upload'}
                  </Text>
                  <Text size="sm" c="dimmed" className="mt-[7px]">
                    {currentFile
                      ? 'Preparing your media page…'
                      : 'Or click to select files. Your media will be private until you publish them.'}
                  </Text>
                </div>
              </div>
            </Dropzone>

            <Text
              size="xs"
              c="dimmed"
              ta="center"
              style={{ textWrap: 'pretty' }}
              className="mt-4"
            >
              By submitting your media to Let's Church, you acknowledge that you
              agree to our{' '}
              <Text component="a" href="/about/terms" c="blue" size="xs">
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text component="a" href="/about/theology" c="blue" size="xs">
                Statement of Theology
              </Text>
              .
            </Text>
            <Text size="xs" c="dimmed" ta="center" className="mt-2.5">
              Please be sure not to violate others' copyright or privacy rights.{' '}
              <Text component="a" href="/about/dmca" c="blue" size="xs">
                Learn more
              </Text>
            </Text>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      <LcModal.Root
        open={importModalOpened}
        onOpenChange={(o) => {
          if (!o) closeImportModal();
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="lg">
            <ModalHeader title="Import Media from URL" />
            <div className="flex flex-col gap-4">
              <TextInput
                label="URL"
                placeholder="https://example.com/video.mp4"
                required
                value={importFormData.url}
                onChange={(e) =>
                  setImportFormData({
                    ...importFormData,
                    url: e.currentTarget.value,
                  })
                }
              />

              <TextInput
                label="Title"
                placeholder="Video title"
                required
                value={importFormData.title}
                onChange={(e) =>
                  setImportFormData({
                    ...importFormData,
                    title: e.currentTarget.value,
                  })
                }
              />

              <Textarea
                label="Description"
                placeholder="Video description"
                rows={3}
                value={importFormData.description}
                onChange={(e) =>
                  setImportFormData({
                    ...importFormData,
                    description: e.currentTarget.value,
                  })
                }
              />

              <Select
                label="License"
                description={
                  importFormData.license === 'STANDARD'
                    ? 'You retain all rights'
                    : 'Free for anyone to use without restrictions'
                }
                data={[
                  { value: 'STANDARD', label: 'Standard License' },
                  { value: 'PUBLIC_DOMAIN', label: 'Public Domain' },
                ]}
                value={importFormData.license}
                onChange={(value) =>
                  setImportFormData({
                    ...importFormData,
                    license: value as UploadLicense,
                  })
                }
              />

              <Select
                label="Visibility"
                description={
                  importFormData.visibility === 'PUBLIC'
                    ? 'Visible to everyone and appears in search results'
                    : importFormData.visibility === 'UNLISTED'
                      ? "Only visible to people with the link, won't appear in searches"
                      : 'Only visible to you and channel members'
                }
                data={[
                  { value: 'PUBLIC', label: 'Public' },
                  { value: 'UNLISTED', label: 'Unlisted' },
                  { value: 'PRIVATE', label: 'Private' },
                ]}
                value={importFormData.visibility}
                onChange={(value) =>
                  setImportFormData({
                    ...importFormData,
                    visibility: value as UploadVisibility,
                  })
                }
              />

              <TextInput
                label="Published Date"
                type="date"
                value={importFormData.publishedAt.toISOString().slice(0, 10)}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  const date = v ? new Date(v) : new Date();
                  setImportFormData({
                    ...importFormData,
                    publishedAt: date,
                  });
                }}
              />

              <Checkbox
                label="Enable user comments"
                checked={importFormData.userCommentsEnabled}
                onChange={(checked) =>
                  setImportFormData({
                    ...importFormData,
                    userCommentsEnabled: checked,
                  })
                }
              />

              <Checkbox
                label="Trim silence"
                checked={importFormData.trimSilence}
                onChange={(checked) =>
                  setImportFormData({
                    ...importFormData,
                    trimSilence: checked,
                  })
                }
              />

              <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
                <Button variant="subtle" onClick={closeImportModal}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImportMedia}
                  loading={importMediaMutation.isPending}
                  disabled={!importFormData.url || !importFormData.title}
                >
                  Start Import
                </Button>
              </div>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      <LcModal.Root
        open={bulkImportModalOpened}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeBulkImportModal();
            setBulkImportFile(null);
          }
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="lg">
            <ModalHeader title={`Bulk Import to ${channel.name}`} />
            <div className="flex flex-col gap-4">
              <Text size="sm" c="dimmed">
                Each CSV row launches a Temporal media-import job for this
                channel, just like importing a single URL. It does not use or
                change recurring import sources.
              </Text>

              <div>
                <Text size="sm" fw={500}>
                  CSV file
                </Text>
                <Text size="xs" c="dimmed" className="mb-1">
                  Required columns: url, title. Optional: description,
                  publishedAt (ISO 8601), thumbnail (image URL). Rows keep their
                  order in a series. Maximum file size: 64 MiB.
                </Text>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) =>
                    setBulkImportFile(event.target.files?.[0] ?? null)
                  }
                  className="text-primary file:bg-brand/10 file:text-brand mt-1 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:px-3 file:py-2 file:font-semibold"
                />
              </div>

              <ImportSeriesFields
                channelId={channel.id}
                value={bulkImportSeries}
                onChange={setBulkImportSeries}
              />

              <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
                <Button
                  variant="subtle"
                  onClick={() => {
                    closeBulkImportModal();
                    setBulkImportFile(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  leftSection={<IconUpload size={16} />}
                  onClick={handleBulkImport}
                  loading={bulkImportMutation.isPending}
                  disabled={
                    !bulkImportFile || !isImportSeriesComplete(bulkImportSeries)
                  }
                >
                  Start Bulk Import
                </Button>
              </div>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      <LcModal.Root
        open={feedImportModalOpened}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeFeedImportModal();
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="lg">
            <ModalHeader title={`Import Feed to ${channel.name}`} />
            <div className="flex flex-col gap-4">
              <Text size="sm" c="dimmed">
                Imports every audio or video item in an RSS or podcast feed
                once, in episode order, using the feed&apos;s artwork as
                thumbnails. To keep importing new episodes as they are
                published, set up an import source instead.
              </Text>

              <TextInput
                label="Feed URL"
                placeholder="https://example.com/feed.xml"
                required
                value={feedImportForm.url}
                onChange={(e) =>
                  setFeedImportForm({
                    ...feedImportForm,
                    url: e.currentTarget.value,
                  })
                }
              />

              <Select
                label="License"
                description="By default, uses the license the feed declares, or the channel's default license if it declares none."
                data={[
                  { value: 'FEED', label: 'From the feed' },
                  { value: 'STANDARD', label: 'Standard Copyright' },
                  { value: 'PUBLIC_DOMAIN', label: 'Public Domain' },
                  {
                    group: 'Creative Commons',
                    items: [
                      { value: 'CC_BY', label: 'CC BY' },
                      { value: 'CC_BY_SA', label: 'CC BY-SA' },
                      { value: 'CC_BY_NC', label: 'CC BY-NC' },
                      { value: 'CC_BY_NC_SA', label: 'CC BY-NC-SA' },
                      { value: 'CC_BY_ND', label: 'CC BY-ND' },
                      { value: 'CC_BY_NC_ND', label: 'CC BY-NC-ND' },
                      { value: 'CC0', label: 'CC0' },
                    ],
                  },
                ]}
                value={feedImportForm.license}
                onChange={(license) =>
                  setFeedImportForm({
                    ...feedImportForm,
                    license: license as UploadLicense | 'FEED',
                  })
                }
              />

              <ImportSeriesFields
                channelId={channel.id}
                value={feedImportForm.series}
                onChange={(series) =>
                  setFeedImportForm({ ...feedImportForm, series })
                }
              />

              <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
                <Button variant="subtle" onClick={closeFeedImportModal}>
                  Cancel
                </Button>
                <Button
                  leftSection={<IconRss size={16} />}
                  onClick={handleFeedImport}
                  loading={feedImportMutation.isPending}
                  disabled={
                    !feedImportForm.url.trim() ||
                    !isImportSeriesComplete(feedImportForm.series)
                  }
                >
                  Start Feed Import
                </Button>
              </div>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      <LcModal.Root
        open={showBulkDeleteModal}
        onOpenChange={(o) => {
          if (!o) setShowBulkDeleteModal(false);
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Confirm Bulk Delete" />
            <div className="flex flex-col gap-4">
              <Text>
                Are you sure you want to delete {selection.length} selected
                upload
                {selection.length > 1 ? 's' : ''}?
              </Text>
              <Text size="sm" c="dimmed">
                This action cannot be undone. The uploads will be permanently
                deleted.
              </Text>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                  variant="default"
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={bulkDeleteMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  color="red"
                  onClick={() => {
                    bulkDeleteMutation.mutate(selection);
                  }}
                  loading={bulkDeleteMutation.isPending}
                >
                  Delete {selection.length} Upload
                  {selection.length > 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      <LcModal.Root
        open={uploadToDelete !== null}
        onOpenChange={(o) => {
          if (!o) setUploadToDelete(null);
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Confirm Delete" />
            <div className="flex flex-col gap-4">
              <Text>
                Are you sure you want to delete the upload "
                {uploadToDelete?.title}
                "?
              </Text>
              <Text size="sm" c="dimmed">
                This action cannot be undone. The upload will be permanently
                removed from all storage systems.
              </Text>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                  variant="default"
                  onClick={() => setUploadToDelete(null)}
                  disabled={deleteUploadMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  color="red"
                  onClick={() => {
                    if (uploadToDelete) {
                      deleteUploadMutation.mutate({
                        channelId: channel.id,
                        uploadId: uploadToDelete.id,
                      });
                    }
                  }}
                  loading={deleteUploadMutation.isPending}
                >
                  Delete Upload
                </Button>
              </div>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      <div className="dashboard-panel overflow-hidden">
        <DataTableToolbar>
          <DataTableSearch
            value={searchValue}
            onChange={setSearchValue}
            placeholder="Search uploads by title..."
          />
        </DataTableToolbar>
        <Table highlightOnHover withRowBorders withTableBorder={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>
                <Checkbox
                  aria-label="Select all uploads on this page"
                  checked={handlers.isAllSelected()}
                  indeterminate={handlers.isSomeSelected()}
                  onChange={() => {
                    if (handlers.isAllSelected()) {
                      handlers.resetSelection();
                    } else {
                      handlers.setSelection(uploadIds);
                    }
                  }}
                />
              </Table.Th>
              <SortableUploadHeader
                column="title"
                direction={search.direction}
                label="Video"
                sort={search.sort}
                onSort={handleSort}
              />
              <SortableUploadHeader
                column="visibility"
                direction={search.direction}
                label="Visibility"
                sort={search.sort}
                onSort={handleSort}
              />
              <SortableUploadHeader
                column="views"
                direction={search.direction}
                label="Views"
                sort={search.sort}
                onSort={handleSort}
              />
              <SortableUploadHeader
                column="createdAt"
                direction={search.direction}
                label="Created"
                sort={search.sort}
                onSort={handleSort}
              />
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {uploads.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text ta="center" c="dimmed" className="py-8">
                    No uploads found
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              uploads.map((upload) => {
                const isSelected = selection.includes(upload.id);
                const isDeleted = deletedUploads[upload.id];
                const canEditUpload = (isAdmin || canEdit) && !isDeleted;
                const canDownloadUpload =
                  !isDeleted &&
                  (isAdmin || (channel.userMembership?.canDownload ?? false));
                const canFeatureUpload = isSiteAdmin && !isDeleted;
                const canDeleteUpload = canDelete && !isDeleted;
                const hasUploadActions =
                  canEditUpload ||
                  (canDownloadUpload && Boolean(upload.finalizedUploadKey)) ||
                  canFeatureUpload ||
                  canDeleteUpload;
                return (
                  <Table.Tr
                    key={upload.id}
                    className={
                      isSelected ? 'bg-blue-50 dark:bg-blue-950/30' : undefined
                    }
                    style={{
                      cursor: isDeleted ? 'default' : 'pointer',
                      opacity: isDeleted ? 0.5 : 1,
                    }}
                    onClick={
                      isDeleted
                        ? undefined
                        : () => {
                            navigate({
                              to: `/dashboard/channels/${data.channel.id}/uploads/${upload.id}`,
                            });
                          }
                    }
                  >
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handlers.toggle(upload.id)}
                        disabled={isDeleted}
                      />
                    </Table.Td>
                    <Table.Td>
                      <div className="flex flex-wrap items-start justify-start gap-3">
                        <div className="relative">
                          <div className="aspect-video" style={{ width: 120 }}>
                            {upload.thumbnailUrl ? (
                              <img
                                src={upload.thumbnailUrl}
                                alt={upload.title || 'Video thumbnail'}
                                style={{
                                  borderRadius: 4,
                                  objectFit: 'cover',
                                  width: '100%',
                                  height: '100%',
                                }}
                              />
                            ) : (
                              <div
                                className="bg-gray-300"
                                style={{
                                  borderRadius: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '100%',
                                  height: '100%',
                                }}
                              >
                                <IconCube3dSphere
                                  size={24}
                                  stroke={1}
                                  color="#adb5bd"
                                />
                              </div>
                            )}
                          </div>
                          {upload.lengthSeconds && (
                            <div
                              className="absolute"
                              style={{
                                bottom: 4,
                                right: 4,
                                padding: '1px 4px',
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                borderRadius: 2,
                                fontSize: '11px',
                                color: 'white',
                                fontFamily: 'monospace',
                                lineHeight: 1,
                              }}
                            >
                              {formatTime(upload.lengthSeconds * 1000)}
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text fw={500} lineClamp={2} size="sm">
                            {upload.title}
                          </Text>
                          <Text
                            size="xs"
                            c="dimmed"
                            lineClamp={2}
                            className={cn(
                              upload.description ? undefined : 'italic',
                              'mt-[2px]',
                            )}
                          >
                            {upload.description || 'No description'}
                          </Text>
                        </div>
                      </div>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={getVisibilityColor(upload.visibility)}
                        size="sm"
                        leftSection={getVisibilityIcon(upload.visibility)}
                      >
                        {upload.visibility}
                      </Badge>
                      {upload.scheduledPublishAt ? (
                        <Badge
                          color="blue"
                          size="sm"
                          className="mt-1"
                          leftSection={<IconClock size={16} />}
                        >
                          {/* Local time only exists on the client. */}
                          <ClientOnly fallback="Scheduled">
                            {`Scheduled ${new Date(
                              upload.scheduledPublishAt,
                            ).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}`}
                          </ClientOnly>
                        </Badge>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{upload._count.uploadViews}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {formatDate(upload.createdAt, 'short')}
                      </Text>
                    </Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      {hasUploadActions ? (
                        <OverflowMenu
                          label={`Actions for ${upload.title || 'untitled upload'}`}
                          triggerProps={{ size: 'sm' }}
                        >
                          {canEditUpload ? (
                            <MenuItemButton
                              icon={<IconEdit size={16} />}
                              onClick={() =>
                                navigate({
                                  to: `/dashboard/channels/${data.channel.id}/uploads/${upload.id}`,
                                })
                              }
                            >
                              Edit
                            </MenuItemButton>
                          ) : null}

                          {canDownloadUpload && upload.finalizedUploadKey ? (
                            <MenuItemButton
                              icon={<IconDownload size={16} />}
                              onClick={() =>
                                downloadOriginalMutation.mutate({
                                  channelId: channel.id,
                                  uploadId: upload.id,
                                })
                              }
                            >
                              Download Original
                            </MenuItemButton>
                          ) : null}

                          {canFeatureUpload ? (
                            <MenuItemButton
                              icon={
                                upload.isFeatured ? (
                                  <IconStarFilled size={16} />
                                ) : (
                                  <IconStar size={16} />
                                )
                              }
                              onClick={() =>
                                toggleFeaturedMutation.mutate({
                                  uploadId: upload.id,
                                })
                              }
                            >
                              {upload.isFeatured
                                ? 'Remove from Featured'
                                : 'Add to Featured'}
                            </MenuItemButton>
                          ) : null}

                          {canDeleteUpload ? (
                            <>
                              <LcMenu.Separator />
                              <MenuItemButton
                                icon={<IconTrash size={16} />}
                                className="text-red-600 dark:text-red-400"
                                onClick={() =>
                                  setUploadToDelete({
                                    id: upload.id,
                                    title: upload.title || 'Untitled Upload',
                                  })
                                }
                              >
                                Delete
                              </MenuItemButton>
                            </>
                          ) : null}
                        </OverflowMenu>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>

        {pagination.totalPages > 1 && (
          <div className="border-dashboard-rule bg-dashboard-raised flex flex-wrap items-center justify-center gap-4 border-t px-4 py-3">
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <Button
                variant="default"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => {
                  navigate({
                    to: '.',
                    search: {
                      page: pagination.page - 1,
                      limit: search.limit,
                      search: search.search,
                      sort: search.sort,
                      direction: search.direction,
                    },
                  });
                }}
              >
                Previous
              </Button>
              <Text size="sm" c="dimmed">
                Page {pagination.page} of {pagination.totalPages}
              </Text>
              <Button
                variant="default"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => {
                  navigate({
                    to: '.',
                    search: {
                      page: pagination.page + 1,
                      limit: search.limit,
                      search: search.search,
                      sort: search.sort,
                      direction: search.direction,
                    },
                  });
                }}
              >
                Next
              </Button>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
