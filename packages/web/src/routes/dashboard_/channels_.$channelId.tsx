import {
  Avatar,
  Badge,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconHeart,
  IconList,
  IconShield,
  IconVideo,
  IconX,
} from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import clsx from 'clsx';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';
import { StatCard } from './-components/stat-card';
import styles from './-styles.module.css';

export const Route = createFileRoute('/dashboard_/channels_/$channelId')({
  component: ChannelDetailsPage,
  beforeLoad: async ({ context, params }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }

    // Check if user has access to this channel (either member or site admin)
    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );

    // Site admins can access any channel
    if (currentUser.role === 'ADMIN') {
      return { isSiteAdmin: true };
    }

    // Check if user is a member of this channel
    try {
      await context.queryClient.ensureQueryData(
        context.trpc.dashboard.channels.getChannelDetails.queryOptions({
          channelId: params.channelId,
        }),
      );
      return { isSiteAdmin: false };
    } catch (_error) {
      // If user is not a member and not an admin, redirect
      throw redirect({ to: '/dashboard' });
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
  const queryClient = useQueryClient();
  const { isSiteAdmin } = Route.useRouteContext() as { isSiteAdmin: boolean };

  const { data: channel } = useSuspenseQuery(
    trpc.dashboard.channels.getChannelDetails.queryOptions({
      channelId: params.channelId,
    }),
  );

  const { data: importStats } = useSuspenseQuery(
    trpc.dashboard.importSources.getStats.queryOptions({
      channelId: params.channelId,
    }),
  );

  const { userMembership } = channel;
  const isChannelAdmin = userMembership?.isAdmin ?? false;
  const isApproved = Boolean(channel.approvedAt);

  const approveChannelMutation = useMutation(
    trpc.dashboard.channels.approveChannel.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Channel approved successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelDetails.queryKey({
            channelId: params.channelId,
          }),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to approve channel',
          color: 'red',
        });
      },
    }),
  );

  const unapproveChannelMutation = useMutation(
    trpc.dashboard.channels.unapproveChannel.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Channel unapproved successfully',
          color: 'orange',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelDetails.queryKey({
            channelId: params.channelId,
          }),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to unapprove channel',
          color: 'red',
        });
      },
    }),
  );

  const handleApproveChannel = () => {
    approveChannelMutation.mutate({ channelId: params.channelId });
  };

  const handleUnapproveChannel = () => {
    unapproveChannelMutation.mutate({ channelId: params.channelId });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Group align="flex-start">
          <Avatar size="xl" src={channel.avatarUrl} alt={channel.name}>
            {channel.name.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <Group gap="sm" mb="xs">
              <Title order={1}>{channel.name}</Title>
              <Tooltip
                label={
                  isApproved
                    ? 'This channel has been approved and is visible to the public'
                    : 'This channel is pending approval and not yet visible to the public'
                }
                withArrow
              >
                <Badge color={isApproved ? 'green' : 'yellow'} size="sm">
                  {isApproved ? 'Approved' : 'Pending'}
                </Badge>
              </Tooltip>
              <Tooltip
                label={
                  channel.visibility === 'PUBLIC'
                    ? 'Anyone can view this channel and its content'
                    : channel.visibility === 'UNLISTED'
                      ? 'Only people with the link can view this channel'
                      : 'Only channel members can view this content'
                }
                withArrow
              >
                <Badge
                  color={channel.visibility === 'PUBLIC' ? 'green' : 'orange'}
                  size="sm"
                >
                  {channel.visibility}
                </Badge>
              </Tooltip>
              <Tooltip
                label={
                  isChannelAdmin
                    ? 'You can edit this channel and manage settings'
                    : 'You have access to view and upload content to this channel'
                }
                withArrow
              >
                <Badge color={isChannelAdmin ? 'blue' : 'green'} size="sm">
                  {isChannelAdmin ? 'Admin' : 'Member'}
                </Badge>
              </Tooltip>
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
        <Stack>
          {isSiteAdmin &&
            (!isApproved ? (
              <Button
                color="green"
                leftSection={<IconCheck size={16} />}
                onClick={handleApproveChannel}
                loading={approveChannelMutation.isPending}
              >
                Approve Channel
              </Button>
            ) : (
              <Button
                color="orange"
                leftSection={<IconX size={16} />}
                onClick={handleUnapproveChannel}
                loading={unapproveChannelMutation.isPending}
              >
                Unapprove Channel
              </Button>
            ))}
          {(isChannelAdmin || isSiteAdmin) && (
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
          )}
        </Stack>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        <StatCard
          title="Uploads"
          to="/dashboard/channels/$channelId/uploads"
          color="blue"
          icon={<IconVideo size={22} stroke={1.5} />}
          tooltip="Videos and audio files uploaded to this channel"
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
          tooltip="Collections of media organized by theme or series"
          value={channel._count.uploadLists}
        />

        {(isChannelAdmin || isSiteAdmin) && (
          <StatCard
            title="Members"
            to="/dashboard/channels/$channelId/members"
            color="green"
            icon={<IconShield size={22} stroke={1.5} />}
            tooltip="People who can manage and upload content to this channel"
            value={channel._count.memberships}
          />
        )}

        <StatCard
          title="Subscribers"
          color="green"
          icon={<IconHeart size={22} stroke={1.5} />}
          tooltip="People following this channel for updates"
          value={channel._count.subscribers}
        />
      </SimpleGrid>

      {importStats.length > 0 && (
        <Stack gap="md">
          <Title order={3}>Import Sources</Title>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Source URL</Table.Th>
                <Table.Th>Last Import</Table.Th>
                <Table.Th>Earliest Date</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {importStats.map((stat) => (
                <Table.Tr key={stat.id}>
                  <Table.Td>
                    <Text
                      size="sm"
                      style={{
                        maxWidth: '400px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {stat.url}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {stat.lastImportedAt
                      ? formatDate(stat.lastImportedAt)
                      : 'Never'}
                  </Table.Td>
                  <Table.Td>
                    {stat.earliestImportDate
                      ? formatDate(stat.earliestImportDate)
                      : 'N/A'}
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={
                        stat.workflowStatus === 'RUNNING' && stat.enabled
                          ? 'green'
                          : !stat.enabled || stat.workflowStatus === 'PAUSED'
                            ? 'gray'
                            : stat.workflowStatus === 'FAILED'
                              ? 'red'
                              : 'yellow'
                      }
                    >
                      {!stat.enabled
                        ? 'Paused'
                        : stat.workflowStatus === 'RUNNING'
                          ? 'Running'
                          : stat.workflowStatus}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      )}
    </Stack>
  );
}
