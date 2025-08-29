import {
  ActionIcon,
  Badge,
  Box,
  Checkbox,
  Group,
  Pagination,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useSelection } from '@mantine/hooks';
import { IconEdit, IconEye, IconEyeOff } from '@tabler/icons-react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { invariant } from 'es-toolkit';
import { z } from 'zod';
import db from '@/util/db';
import { formatDate, formatTime } from '@/util/format';
import { hasValidSession, requireAuthMiddleware } from '../-functions';
import { dashboardQueryKeys } from './-query-keys';

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
      data,
      backNavigation: {
        label: data.channel.name,
        to: `/dashboard/channels/${params.channelId}`,
      },
    };
  },
});

function ChannelUploadsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data } = Route.useLoaderData();

  const { channel, uploads, pagination } = data;
  const isAdmin = channel.userMembership?.isAdmin ?? false;
  const canEdit = channel.userMembership?.canEdit ?? false;

  const uploadIds = uploads.map((upload) => upload.id);
  const [selection, handlers] = useSelection({ data: uploadIds });

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

  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>Uploads</Title>
        <Text c="dimmed">
          {channel.name} • {pagination.totalCount} total uploads
        </Text>
      </div>

      <Paper p="md">
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
              {(isAdmin || canEdit) && <Table.Th>Actions</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {uploads.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={isAdmin || canEdit ? 6 : 5}>
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
                    {(isAdmin || canEdit) && (
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          onClick={() => {
                            navigate({
                              to: `/dashboard/channels/${data.channel.id}/uploads/${upload.id}`,
                            });
                          }}
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                      </Table.Td>
                    )}
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
      </Paper>
    </Stack>
  );
}
