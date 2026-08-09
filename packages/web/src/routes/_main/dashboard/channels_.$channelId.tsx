import {
  IconBroadcast,
  IconCheck,
  IconHeart,
  IconList,
  IconMicrophone,
  IconShield,
  IconUsers,
  IconVideo,
  IconX,
} from '@tabler/icons-react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import {
  Avatar,
  Badge,
  Button,
  Table,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { notifications } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

import { StatCard } from './-components/stat-card';

export const Route = createFileRoute('/_main/dashboard/channels_/$channelId')({
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
  const canManageLive = isChannelAdmin || isSiteAdmin;

  // Live stream status for the tile (admin-only; the procedure is admin-gated).
  const liveStreamQuery = useQuery({
    ...trpc.dashboard.liveStreaming.getLiveStream.queryOptions({
      channelId: params.channelId,
    }),
    enabled: canManageLive,
  });
  const liveStatus = liveStreamQuery.isLoading
    ? '—'
    : !liveStreamQuery.data
      ? 'Not set up'
      : liveStreamQuery.data.status === 'active'
        ? 'Live'
        : 'Idle';

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-start justify-start gap-4">
          <Avatar
            src={channel.avatarUrl}
            alt={channel.name}
            className="size-14"
          />
          <div>
            <div className="mb-2.5 flex flex-wrap items-center justify-start gap-3">
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
            </div>
            <div className="mb-3 flex flex-wrap items-center justify-start gap-4">
              <Text c="dimmed">@{channel.slug}</Text>
              <Text c="dimmed" size="sm">
                Created {formatDate(channel.createdAt)}
              </Text>
            </div>
            {channel.description && (
              <Text size="sm" className="max-w-[600px]">
                {channel.description}
              </Text>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-4">
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
              component={Link}
              to="/dashboard/channels/$channelId/edit"
              params={{ channelId: channel.id }}
              variant="light"
              className="content-center"
            >
              Edit Channel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <StatCard
          title="Uploads"
          to="/dashboard/channels/$channelId/uploads"
          color="blue"
          icon={<IconVideo size={22} stroke={1.5} />}
          tooltip="Videos and audio files uploaded to this channel"
          value={
            <Text>
              {channel._count.uploadRecords}{' '}
              <Text span size="sm" c="blue">
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

        {(isChannelAdmin || isSiteAdmin) && (
          <StatCard
            title="Speakers"
            to="/dashboard/channels/$channelId/speakers"
            color="violet"
            icon={<IconMicrophone size={22} stroke={1.5} />}
            tooltip="Named speakers your transcripts can be attributed to"
            value={channel._count.speakers}
          />
        )}

        {(isChannelAdmin || isSiteAdmin) && (
          <StatCard
            title="Speaker labeling"
            to="/dashboard/channels/$channelId/speaker-queue"
            color="violet"
            icon={<IconUsers size={22} stroke={1.5} />}
            tooltip="Diarized voices in this channel that still need a speaker"
            value={
              <Text>
                {channel._count.unlabeledVoices}{' '}
                <Text span size="sm" c="purple">
                  unlabeled voices
                </Text>
              </Text>
            }
          />
        )}

        {canManageLive && (
          <StatCard
            title="Live Streaming"
            to="/dashboard/channels/$channelId/live"
            color="violet"
            icon={<IconBroadcast size={22} stroke={1.5} />}
            tooltip="Provision a stream key, configure restreaming, and set up broadcasts"
            value={liveStatus}
          />
        )}

        <StatCard
          title="Subscribers"
          color="green"
          icon={<IconHeart size={22} stroke={1.5} />}
          tooltip="People following this channel for updates"
          value={channel._count.subscribers}
        />
      </div>

      {importStats.length > 0 && (
        <div className="flex flex-col gap-4">
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
        </div>
      )}
    </div>
  );
}
