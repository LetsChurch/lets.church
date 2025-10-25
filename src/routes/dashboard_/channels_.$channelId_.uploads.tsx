import {
  ActionIcon,
  AspectRatio,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  Pagination,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useDisclosure, useSelection } from '@mantine/hooks';
import { useStore } from '@nanostores/react';
import {
  IconChevronDown,
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
import { useState } from 'react';
import { z } from 'zod';
import { trpcClient, useTRPC } from '@/trpc/react';
import { formatDate, formatTime } from '@/util/format';
import { doMultipartUpload } from '@/util/multipart-upload';
import { showFailure, showSuccess } from '../-mantine';

export const $uploadProgress = map<Record<string, number | undefined>>({});
export const $deletedUploads = map<Record<string, true>>({});

export const Route = createFileRoute(
  '/dashboard_/channels_/$channelId_/uploads',
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
  }),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({
    context: { queryClient, trpc },
    params,
    deps: { search },
  }) => {
    const data = await queryClient.ensureQueryData(
      trpc.dashboard.channels.getChannelUploads.queryOptions({
        channelId: params.channelId,
        page: search.page,
        limit: search.limit,
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
    }),
  );

  const { channel, uploads, pagination } = data;
  const isChannelAdmin = channel.userMembership?.isAdmin ?? false;
  const userMembership = channel.memberships?.find(
    (m) => m.appUser.id === channel.userMembership?.appUserId,
  );
  const isSiteAdmin = userMembership?.appUser?.role === 'ADMIN';
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
  const [selection, handlers] = useSelection({ data: uploadIds });

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

  const handleDrop = ([file]: File[]) => {
    setCurrentFile(file);
    createUploadMutation.mutate({
      channelId: channel.id,
    });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1}>Uploads</Title>
          <Text c="dimmed">
            {channel.name} • {pagination.totalCount} total uploads
          </Text>
        </div>

        {canUpload && (
          <Button
            leftSection={<IconUpload size={16} />}
            onClick={openUploadModal}
          >
            Upload
          </Button>
        )}
      </Group>

      {selection.length > 0 ? (
        <Box
          p="md"
          bg="blue.0"
          style={{
            border: '1px solid var(--mantine-color-blue-3)',
            borderRadius: 'var(--mantine-radius-md)',
          }}
        >
          <Group justify="space-between" align="center">
            <Text size="sm" fw={500}>
              {selection.length} upload{selection.length > 1 ? 's' : ''}{' '}
              selected
            </Text>
            <Group gap="sm">
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
                <Menu shadow="md" width={200}>
                  <Menu.Target>
                    <Button
                      size="xs"
                      variant="light"
                      rightSection={<IconChevronDown size={14} />}
                      loading={bulkSetVisibilityMutation.isPending}
                    >
                      Set Visibility
                    </Button>
                  </Menu.Target>

                  <Menu.Dropdown>
                    <Menu.Label>
                      Change visibility for {selection.length} upload
                      {selection.length > 1 ? 's' : ''}
                    </Menu.Label>
                    <Menu.Item
                      leftSection={<IconEye size={16} />}
                      onClick={() => {
                        bulkSetVisibilityMutation.mutate({
                          channelId: channel.id,
                          uploadIds: selection,
                          visibility: 'PUBLIC',
                        });
                      }}
                    >
                      Public
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconEye size={16} stroke={1} />}
                      onClick={() => {
                        bulkSetVisibilityMutation.mutate({
                          channelId: channel.id,
                          uploadIds: selection,
                          visibility: 'UNLISTED',
                        });
                      }}
                    >
                      Unlisted
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconEyeOff size={16} />}
                      onClick={() => {
                        bulkSetVisibilityMutation.mutate({
                          channelId: channel.id,
                          uploadIds: selection,
                          visibility: 'PRIVATE',
                        });
                      }}
                    >
                      Private
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
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
            </Group>
          </Group>
        </Box>
      ) : null}

      <Modal
        opened={uploadModalOpened}
        onClose={closeUploadModal}
        title="Upload Media"
        size="xl"
        centered
      >
        <Dropzone
          onDrop={handleDrop}
          accept={{
            'video/*': ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'],
          }}
          maxSize={5 * 1024 * 1024 * 1024} // 5GB
          multiple={false}
          h={200}
          loading={createUploadMutation.isPending}
        >
          <Group
            justify="center"
            gap="xl"
            mih={220}
            style={{ pointerEvents: 'none' }}
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
              <Text size="xl" inline>
                Drag and drop media files to upload
              </Text>
              <Text size="sm" c="dimmed" inline mt={7}>
                Or click to select files. Your media will be private until you
                publish them.
              </Text>
            </div>
          </Group>
        </Dropzone>

        <Text
          size="xs"
          c="dimmed"
          ta="center"
          mt="md"
          style={{ textWrap: 'pretty' }}
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
        <Text size="xs" c="dimmed" ta="center" mt="xs">
          Please be sure not to violate others' copyright or privacy rights.{' '}
          <Text component="a" href="/about/dmca" c="blue" size="xs">
            Learn more
          </Text>
        </Text>
      </Modal>

      <Modal
        opened={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        title="Confirm Bulk Delete"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete {selection.length} selected upload
            {selection.length > 1 ? 's' : ''}?
          </Text>
          <Text size="sm" c="dimmed">
            This action cannot be undone. The uploads will be permanently
            deleted.
          </Text>
          <Group justify="flex-end" gap="sm">
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
              Delete {selection.length} Upload{selection.length > 1 ? 's' : ''}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={uploadToDelete !== null}
        onClose={() => setUploadToDelete(null)}
        title="Confirm Delete"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete the upload "{uploadToDelete?.title}
            "?
          </Text>
          <Text size="sm" c="dimmed">
            This action cannot be undone. The upload will be permanently removed
            from all storage systems.
          </Text>
          <Group justify="flex-end" gap="sm">
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
          </Group>
        </Stack>
      </Modal>

      <Table verticalSpacing="md">
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
                <Text ta="center" c="dimmed" py="xl">
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
                  bg={
                    isSelected ? 'var(--mantine-color-blue-light)' : undefined
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
                    <Group gap="sm" align="flex-start">
                      <Box pos="relative">
                        <AspectRatio ratio={16 / 9} w={120}>
                          {upload.thumbnailUrl ? (
                            <Box
                              component="img"
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
                            <Box
                              bg="gray.3"
                              style={{
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%',
                                height: '100%',
                              }}
                            >
                              <Text size="xs" c="dimmed">
                                📹
                              </Text>
                            </Box>
                          )}
                        </AspectRatio>
                        {upload.lengthSeconds && (
                          <Box
                            pos="absolute"
                            bottom={4}
                            right={4}
                            px={4}
                            py={1}
                            bg="rgba(0, 0, 0, 0.8)"
                            style={{
                              borderRadius: 2,
                              fontSize: '11px',
                              color: 'white',
                              fontFamily: 'monospace',
                              lineHeight: 1,
                            }}
                          >
                            {formatTime(upload.lengthSeconds * 1000)}
                          </Box>
                        )}
                      </Box>
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text fw={500} lineClamp={2} size="sm">
                          {upload.title}
                        </Text>
                        <Text
                          size="xs"
                          c="dimmed"
                          lineClamp={2}
                          mt={2}
                          fs={upload.description ? 'normal' : 'italic'}
                        >
                          {upload.description || 'No description'}
                        </Text>
                      </Box>
                    </Group>
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
                    <Group gap="xs">
                      {isSiteAdmin ? (
                        <Tooltip
                          label={
                            upload.isFeatured
                              ? 'Remove from featured'
                              : 'Add to featured'
                          }
                        >
                          <ActionIcon
                            variant="subtle"
                            color={upload.isFeatured ? 'yellow' : 'gray'}
                            size="sm"
                            onClick={() => {
                              toggleFeaturedMutation.mutate({
                                uploadId: upload.id,
                              });
                            }}
                            loading={toggleFeaturedMutation.isPending}
                          >
                            {upload.isFeatured ? (
                              <IconStarFilled size={16} />
                            ) : (
                              <IconStar size={16} />
                            )}
                          </ActionIcon>
                        </Tooltip>
                      ) : null}
                      {(() => {
                        const canEditUpload =
                          (isAdmin || canEdit) && !isDeleted;
                        const tooltipText = isDeleted
                          ? 'Upload is being deleted'
                          : canEditUpload
                            ? 'Edit this upload'
                            : 'Only admins and editors can edit uploads';

                        return (
                          <Tooltip label={tooltipText}>
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              disabled={!canEditUpload}
                              onClick={() => {
                                if (canEditUpload) {
                                  navigate({
                                    to: `/dashboard/channels/${data.channel.id}/uploads/${upload.id}`,
                                  });
                                }
                              }}
                            >
                              <IconEdit size={16} />
                            </ActionIcon>
                          </Tooltip>
                        );
                      })()}
                      {(() => {
                        const canDeleteUpload = canDelete && !isDeleted;
                        const tooltipText = isDeleted
                          ? 'Upload is being deleted'
                          : canDelete
                            ? 'Delete this upload'
                            : 'Only channel admins and site admins can delete uploads';

                        return (
                          <Tooltip label={tooltipText}>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size="sm"
                              disabled={!canDeleteUpload}
                              onClick={() => {
                                if (canDeleteUpload) {
                                  setUploadToDelete({
                                    id: upload.id,
                                    title: upload.title || 'Untitled Upload',
                                  });
                                }
                              }}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        );
                      })()}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>

      {pagination.totalPages > 1 && (
        <Group justify="center" mt="lg">
          <Pagination
            total={pagination.totalPages}
            value={pagination.page}
            onChange={(page) => {
              navigate({
                to: '.',
                search: { page, limit: search.limit },
              });
            }}
            size="sm"
          />
        </Group>
      )}
    </Stack>
  );
}
