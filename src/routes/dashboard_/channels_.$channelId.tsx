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
import {
  IconHeart,
  IconList,
  IconShield,
  IconVideo,
} from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import clsx from 'clsx';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';
import { StatCard } from './-components/stat-card';
import styles from './-styles.module.css';

export const Route = createFileRoute('/dashboard_/channels_/$channelId')({
  component: ChannelDetailsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.channels.getChannelDetails.queryOptions({
        channelId: params.channelId,
      }),
    );
    return {
      backNavigation: {
        label: 'My Channels',
        to: '/dashboard/channels',
      },
    };
  },
});

function ChannelDetailsPage() {
  const params = Route.useParams();
  const trpc = useTRPC();

  const { data: channel } = useSuspenseQuery(
    trpc.dashboard.channels.getChannelDetails.queryOptions({
      channelId: params.channelId,
    }),
  );

  const { userMembership } = channel;
  const isChannelAdmin = userMembership?.isAdmin ?? false;

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
              <Badge color={isChannelAdmin ? 'blue' : 'green'} size="sm">
                {isChannelAdmin ? 'Admin' : 'Member'}
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
          {isChannelAdmin ? (
            <Button
              variant="light"
              renderRoot={(rootProps) => (
                <Link
                  {...rootProps}
                  className={clsx(rootProps.className, styles.buttonLink)}
                  to="/dashboard/channels/$channelId/edit"
                  params={{ channelId: channel.id }}
                >
                  Edit Channel
                </Link>
              )}
            />
          ) : null}
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
          title="Playlists"
          to="/dashboard/channels/$channelId/playlists"
          color="violet"
          icon={<IconList size={22} stroke={1.5} />}
          tooltip="Curated collections of uploads organized by theme or series"
          value={channel._count.uploadLists}
        />

        <StatCard
          title="Members"
          to="/dashboard/channels/$channelId/members"
          color="green"
          icon={<IconShield size={22} stroke={1.5} />}
          tooltip="Users with permissions to manage, edit, or upload content"
          value={channel._count.memberships}
        />

        <StatCard
          title="Subscribers"
          color="green"
          icon={<IconHeart size={22} stroke={1.5} />}
          tooltip="Users following this channel for new content notifications"
          value={channel._count.subscribers}
        />
      </SimpleGrid>
    </Stack>
  );
}
