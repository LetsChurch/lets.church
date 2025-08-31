import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
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
import { UploadLicense } from '@prisma/client';
import {
  IconEdit,
  IconEye,
  IconEyeOff,
  IconPhoto,
  IconUpload,
} from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { invariant } from 'es-toolkit';
import { map } from 'nanostores';
import { useState } from 'react';
import { z } from 'zod';
import db from '@/util/db';
import { formatDate, formatTime } from '@/util/format';
import { doMultipartUpload } from '@/util/multipart-upload';
import {
  clientCreateMultipartUpload,
  clientFinalizeMultipartUpload,
  hasValidSession,
  requireAuthMiddleware,
  requireChannelUploadAccessMiddleware,
} from '../-functions';
import { showFailure } from '../-mantine';
import { dashboardQueryKeys } from './-query-keys';

export const $uploadProgress = map<Record<string, number | undefined>>({});

const getChannelUploads = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      channelId: z.string(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }),
  )
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    const channel = await db.channel.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        memberships: {
          select: {
            isAdmin: true,
            canEdit: true,
            canUpload: true,
            appUser: {
              select: {
                id: true,
              },
            },
          },
        },
      },
      where: {
        id: data.channelId,
        memberships: {
          some: {
            appUserId: context.session.appUser.id,
          },
        },
      },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    const userMembership = channel.memberships.find(
      (m) => m.appUser.id === context.session?.appUser.id,
    );

    const offset = (data.page - 1) * data.limit;

    const [uploads, totalCount] = await Promise.all([
      db.uploadRecord.findMany({
        select: {
          id: true,
          title: true,
          description: true,
          visibility: true,
          createdAt: true,
          lengthSeconds: true,
          _count: {
            select: {
              uploadViews: true,
              userComments: true,
            },
          },
        },
        where: {
          channelId: data.channelId,
          OR: [
            { visibility: 'PUBLIC' },
            { visibility: 'UNLISTED' },
            {
              AND: [
                { visibility: 'PRIVATE' },
                {
                  channel: {
                    memberships: {
                      some: {
                        appUserId: context.session.appUser.id,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: data.limit,
      }),
      db.uploadRecord.count({
        where: {
          channelId: data.channelId,
          OR: [
            { visibility: 'PUBLIC' },
            { visibility: 'UNLISTED' },
            {
              AND: [
                { visibility: 'PRIVATE' },
                {
                  channel: {
                    memberships: {
                      some: {
                        appUserId: context.session.appUser.id,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / data.limit);

    return {
      channel: {
        ...channel,
        userMembership,
      },
      uploads,
      pagination: {
        page: data.page,
        limit: data.limit,
        totalCount,
        totalPages,
      },
    };
  });

const createUploadRecord = createServerFn({ method: 'POST' })
  .middleware([requireChannelUploadAccessMiddleware])
  .validator(
    z.object({
      channelId: z.string(),
    }),
  )
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    const { id } = await db.uploadRecord.create({
      data: {
        license: UploadLicense.STANDARD,
        visibility: 'PRIVATE',
        channel: {
          connect: {
            id: data.channelId,
          },
        },
        createdBy: {
          connect: {
            id: context.session.appUser.id,
          },
        },
      },
    });

    return id;
  });

const channelUploadsQueryOptions = (
  channelId: string,
  page: number,
  limit: number,
) => ({
  queryKey: dashboardQueryKeys.uploads.list(channelId, page, limit),
  queryFn: () => getChannelUploads({ data: { channelId, page, limit } }),
});

export const Route = createFileRoute(
  '/dashboard_/channels_/$channelId_/uploads',
)({
  component: ChannelUploadsPage,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  validateSearch: z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(20),
  }),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context: { queryClient }, params, deps: { search } }) => {
    const data = await queryClient.ensureQueryData(
      channelUploadsQueryOptions(params.channelId, search.page, search.limit),
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

  const { data } = useSuspenseQuery(
    channelUploadsQueryOptions(params.channelId, search.page, search.limit),
  );

  const { channel, uploads, pagination } = data;
  const isAdmin = channel.userMembership?.isAdmin ?? false;
  const canEdit = isAdmin || (channel.userMembership?.canEdit ?? false);
  const canUpload = isAdmin || (channel.userMembership?.canUpload ?? false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const uploadIds = uploads.map((upload) => upload.id);
  const [selection, handlers] = useSelection({ data: uploadIds });

  const createUploadMutation = useMutation({
    mutationFn: createUploadRecord,
    onSuccess: async (uploadId) => {
      invariant(currentFile, 'Missing upload file');
      try {
        const { urls, partSize, s3UploadKey, s3UploadId } =
          await clientCreateMultipartUpload({
            data: {
              channelId: channel.id,
              targetId: uploadId,
              uploadMimeType: currentFile.type,
              postProcess: 'media',
              bytes: currentFile.size,
            },
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

        await clientFinalizeMultipartUpload({
          data: {
            channelId: channel.id,
            s3UploadKey: s3UploadKey,
            s3UploadId: s3UploadId,
            s3PartETags: etags,
          },
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
  });

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
      data: {
        channelId: channel.id,
      },
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
              return (
                <Table.Tr
                  key={upload.id}
                  bg={
                    isSelected ? 'var(--mantine-color-blue-light)' : undefined
                  }
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    navigate({
                      to: `/dashboard/channels/${data.channel.id}/uploads/${upload.id}`,
                    });
                  }}
                >
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handlers.toggle(upload.id)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Group gap="sm" align="flex-start">
                      <Box pos="relative">
                        <Box
                          w={120}
                          h={68}
                          bg="gray.3"
                          style={{
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Text size="xs" c="dimmed">
                            📹
                          </Text>
                        </Box>
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
                    {(() => {
                      const canEditUpload = isAdmin || canEdit;
                      const tooltipText = canEditUpload
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
