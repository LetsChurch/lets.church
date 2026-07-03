import type { UploadLicense, UploadVisibility } from '@letschurch/db/types';
import { useStore } from '@nanostores/react';
import {
  IconChevronDown,
  IconCube3dSphere,
  IconDotsVertical,
  IconDownload,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconPhoto,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { invariant } from 'es-toolkit';
import { map } from 'nanostores';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { LcMenu, MenuItemButton } from '@/components/lc-menu';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import {
  ActionIcon,
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

export const $uploadProgress = map<Record<string, number | undefined>>({});
export const $deletedUploads = map<Record<string, true>>({});

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
    upload: z.boolean().optional(),
  }),
  loaderDeps: ({ search }) => ({
    page: search.page,
    limit: search.limit,
    search: search.search,
  }),
  loader: async ({
    context: { queryClient, trpc },
    params,
    deps: { page, limit, search },
  }) => {
    const data = await queryClient.ensureQueryData(
      trpc.dashboard.channels.getChannelUploads.queryOptions({
        channelId: params.channelId,
        page,
        limit,
        search,
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
  const [uploadToDelete, setUploadToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

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
        },
      });
    }
  }, [debouncedSearch, search.limit, navigate, search.search]);

  const createUploadMutation = useMutation(
    trpc.dashboard.channels.createUploadRecord.mutationOptions({
      onSuccess: async (uploadId) => {
        invariant(currentFile, 'Missing upload file');
        try {
          const { urls, partSize, s3UploadKey, s3UploadId } =
            await trpcClient.dashboard.channels.createMultipartUpload.mutate({
              channelId: channel.id,
              targetId: uploadId,
              uploadMimeType: currentFile.type,
              postProcess: 'media',
              bytes: currentFile.size,
            });

          const mpu = doMultipartUpload(currentFile, urls, partSize);

          mpu.onProgress((progress) =>
            $uploadProgress.setKey(uploadId, progress),
          );

          const navPromise = navigate({
            to: '/dashboard/channels/$channelId/uploads/$uploadId',
            params: { channelId: channel.id, uploadId },
          });

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
          console.error('Failed to upload file:', error);
          showFailure({
            message:
              error instanceof Error ? error.message : 'Failed to upload file',
          });
        }
        closeUploadModal();
        setCurrentFile(null);
      },
      onError: (error) => {
        console.error('Failed to create upload record:', error);
        setCurrentFile(null);
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
    setCurrentFile(file);
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title order={1}>Uploads</Title>
          <Text c="dimmed">
            {channel.name} • {pagination.totalCount} total uploads
          </Text>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-4">
          {isSiteAdmin && (
            <Button
              variant="light"
              color="blue"
              leftSection={<IconDownload size={16} />}
              onClick={openImportModal}
            >
              Import URL
            </Button>
          )}
          {canUpload && (
            <Button
              leftSection={<IconUpload size={16} />}
              onClick={openUploadModal}
            >
              Upload
            </Button>
          )}
        </div>
      </div>

      <TextInput
        placeholder="Search uploads by title..."
        value={searchValue}
        onChange={(e) => {
          setSearchValue(e.currentTarget.value);
        }}
        style={{ maxWidth: 400 }}
      />

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
                        <div className="px-3 py-1.5 text-secondary text-xs">
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
          if (!o) closeUploadModal();
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
                  <Text size="xl">Drag and drop media files to upload</Text>
                  <Text size="sm" c="dimmed" className="mt-[7px]">
                    Or click to select files. Your media will be private until
                    you publish them.
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

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>
              <Checkbox
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
            <Table.Th>Video</Table.Th>
            <Table.Th>Visibility</Table.Th>
            <Table.Th>Views</Table.Th>
            <Table.Th>Created</Table.Th>
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
                    <LcMenu.Root>
                      <LcMenu.Trigger
                        render={(props) => (
                          <ActionIcon
                            {...props}
                            variant="subtle"
                            color="gray"
                            size="sm"
                          >
                            <IconDotsVertical size={16} />
                          </ActionIcon>
                        )}
                      />
                      <LcMenu.Portal>
                        <LcMenu.Positioner align="end" sideOffset={4}>
                          <LcMenu.Popup>
                            {(() => {
                              const canEditUpload =
                                (isAdmin || canEdit) && !isDeleted;
                              return canEditUpload ? (
                                <LcMenu.Item
                                  render={(props) => (
                                    <button
                                      {...props}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate({
                                          to: `/dashboard/channels/${data.channel.id}/uploads/${upload.id}`,
                                        });
                                      }}
                                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-primary text-sm hover:bg-gray-100 dark:hover:bg-zinc-800"
                                    >
                                      <IconEdit size={16} />
                                      Edit
                                    </button>
                                  )}
                                />
                              ) : null;
                            })()}

                            {(() => {
                              const canDownloadUpload =
                                isAdmin ||
                                (channel.userMembership?.canDownload ?? false);
                              return canDownloadUpload &&
                                upload.finalizedUploadKey ? (
                                <LcMenu.Item
                                  render={(props) => (
                                    <button
                                      {...props}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        downloadOriginalMutation.mutate({
                                          channelId: channel.id,
                                          uploadId: upload.id,
                                        });
                                      }}
                                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-primary text-sm hover:bg-gray-100 dark:hover:bg-zinc-800"
                                    >
                                      <IconDownload size={16} />
                                      Download Original
                                    </button>
                                  )}
                                />
                              ) : null;
                            })()}

                            {isSiteAdmin ? (
                              <LcMenu.Item
                                render={(props) => (
                                  <button
                                    {...props}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFeaturedMutation.mutate({
                                        uploadId: upload.id,
                                      });
                                    }}
                                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-primary text-sm hover:bg-gray-100 dark:hover:bg-zinc-800"
                                  >
                                    {upload.isFeatured ? (
                                      <IconStarFilled size={16} />
                                    ) : (
                                      <IconStar size={16} />
                                    )}
                                    {upload.isFeatured
                                      ? 'Remove from Featured'
                                      : 'Add to Featured'}
                                  </button>
                                )}
                              />
                            ) : null}

                            {(() => {
                              const canDeleteUpload = canDelete && !isDeleted;
                              return canDeleteUpload ? (
                                <>
                                  <LcMenu.Separator />
                                  <LcMenu.Item
                                    render={(props) => (
                                      <button
                                        {...props}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setUploadToDelete({
                                            id: upload.id,
                                            title:
                                              upload.title || 'Untitled Upload',
                                          });
                                        }}
                                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-red-600 text-sm hover:bg-gray-100 dark:hover:bg-zinc-800"
                                      >
                                        <IconTrash size={16} />
                                        Delete
                                      </button>
                                    )}
                                  />
                                </>
                              ) : null;
                            })()}
                          </LcMenu.Popup>
                        </LcMenu.Positioner>
                      </LcMenu.Portal>
                    </LcMenu.Root>
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>

      {pagination.totalPages > 1 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
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
  );
}
