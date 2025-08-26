import {
  Avatar,
  Badge,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconHeart, IconShield, IconVideo } from '@tabler/icons-react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { invariant } from 'es-toolkit';
import { z } from 'zod';
import db from '@/util/db';
import { formatDate } from '@/util/format';
import { hasValidSession, requireAuthMiddleware } from '../-functions';
import { StatCard } from './-components/stat-card';

const getChannelDetails = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ channelId: z.string() }))
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    const channel = await db.channel.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        visibility: true,
        avatarPath: true,
        avatarBlurhash: true,
        defaultThumbnailPath: true,
        defaultThumbnailBlurhash: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          select: {
            isAdmin: true,
            canEdit: true,
            canUpload: true,
            appUser: {
              select: {
                id: true,
                username: true,
                fullName: true,
                emails: {
                  select: {
                    email: true,
                    verifiedAt: true,
                  },
                },
              },
            },
          },
        },
        subscribers: {
          select: {
            appUserId: true,
          },
        },
        uploadRecords: {
          select: {
            id: true,
            title: true,
            createdAt: true,
          },
          where: {
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
          take: 10,
        },
        _count: {
          select: {
            uploadRecords: true,
            subscribers: true,
            memberships: true,
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

    const totalViews = await db.uploadView.count({
      where: {
        upload: {
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
      },
    });

    const userMembership = channel.memberships.find(
      (m) => m.appUser.id === context.session?.appUser.id,
    );

    return {
      ...channel,
      userMembership,
      totalViews,
    } as const;
  });

const channelDetailsQueryOptions = (channelId: string) => ({
  queryKey: ['dashboard', 'channels', channelId],
  queryFn: () => getChannelDetails({ data: { channelId } }),
});

export const Route = createFileRoute('/dashboard_/channels_/$channelId')({
  component: ChannelDetailsPage,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient }, params }) => {
    const data = await queryClient.ensureQueryData(
      channelDetailsQueryOptions(params.channelId),
    );
    return {
      data,
      backNavigation: {
        label: 'My Channels',
        to: '/dashboard/channels',
      },
    };
  },
});

function ChannelDetailsPage() {
  const { data: channel } = Route.useLoaderData();

  const { userMembership } = channel;
  const isAdmin = userMembership?.isAdmin ?? false;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Group align="flex-start">
          <Avatar
            size="xl"
            src={channel.avatarPath ? `/api/media/${channel.avatarPath}` : null}
            alt={channel.name}
          >
            {channel.name.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <Group gap="sm" mb="xs">
              <Title order={1}>{channel.name}</Title>
              <Badge
                color={channel.visibility === 'PUBLIC' ? 'green' : 'orange'}
                size="sm"
              >
                {channel.visibility}
              </Badge>
              <Badge color={isAdmin ? 'blue' : 'green'} size="sm">
                {isAdmin ? 'Admin' : 'Member'}
              </Badge>
            </Group>
            <Group gap="md" mb="sm">
              <Text c="dimmed">@{channel.slug}</Text>
              <Text c="dimmed" size="sm">
                Created {formatDate(channel.createdAt)}
              </Text>
            </Group>
            {channel.description && (
              <Text size="sm" maw={600}>
                {channel.description}
              </Text>
            )}
          </div>
        </Group>
        <Group>
          {isAdmin && <Button variant="light">Edit Channel</Button>}
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        <StatCard
          title="Uploads"
          to="/dashboard/channels/$channelId/uploads"
          color="blue"
          icon={<IconVideo size={22} stroke={1.5} />}
          tooltip="Uploaded media files on this channel"
          value={
            <Text>
              {channel._count.uploadRecords}{' '}
              <Text span size="sm" c="blue.6">
                ({channel.totalViews.toLocaleString()} views)
              </Text>
            </Text>
          }
        />

        <StatCard
          title="Subscribers"
          color="green"
          icon={<IconHeart size={22} stroke={1.5} />}
          tooltip="Users following this channel for new content notifications"
          value={channel._count.subscribers}
        />

        <StatCard
          title="Members"
          color="violet"
          icon={<IconShield size={22} stroke={1.5} />}
          tooltip="Users with permissions to manage, edit, or upload content"
          value={channel._count.memberships}
        />
      </SimpleGrid>
    </Stack>
  );
}
