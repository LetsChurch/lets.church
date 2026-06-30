import { Group, Loader, Stack, Tabs, Text, Title } from '@mantine/core';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../-mantine';
import { SpeakerAppearances } from './-components/speaker-appearances';
import {
  type ClusterCreate,
  SpeakerClusters,
} from './-components/speaker-clusters';
import {
  type QueueAssignment,
  SpeakerLabelingQueue,
} from './-components/speaker-labeling-queue';

export const Route = createFileRoute(
  '/dashboard_/channels_/$channelId_/speaker-queue',
)({
  component: ChannelSpeakerQueuePage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.channels.getSpeakerLabelingQueue.queryOptions({
        channelId: params.channelId,
      }),
    );
    return {
      backNavigation: {
        label: 'Channel',
        to: '/dashboard/channels/$channelId',
        params: { channelId: params.channelId },
      },
    };
  },
});

function ChannelSpeakerQueuePage() {
  const { channelId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data } = useSuspenseQuery(
    trpc.dashboard.channels.getSpeakerLabelingQueue.queryOptions({ channelId }),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.dashboard.channels.getSpeakerLabelingQueue.queryKey({
        channelId,
      }),
    });

  const assignMutation = useMutation(
    trpc.dashboard.channels.assignSpeakerLabels.mutationOptions({
      onSuccess: async (res) => {
        showSuccess({
          message: `Assigned ${res.assigned} segment${res.assigned === 1 ? '' : 's'}`,
        });
        await invalidate();
      },
      onError: (error) =>
        showFailure({ message: error.message || 'Failed to assign' }),
    }),
  );

  const clusterMutation = useMutation(
    trpc.dashboard.channels.createSpeakerFromCluster.mutationOptions({
      onSuccess: async (res) => {
        showSuccess({
          message: `Created speaker and assigned ${res.assigned} segment${res.assigned === 1 ? '' : 's'}`,
        });
        await invalidate();
      },
      onError: (error) =>
        showFailure({ message: error.message || 'Failed to create speaker' }),
    }),
  );

  // Appearances are an expensive cross-platform scan — load only when the tab
  // is opened (not in the route loader).
  const [tab, setTab] = useState<string | null>('matches');
  const appearancesQuery = useQuery({
    ...trpc.dashboard.channels.getSpeakerAppearances.queryOptions({
      channelId,
    }),
    enabled: tab === 'appearances',
  });

  const requestMutation = useMutation(
    trpc.dashboard.channels.requestSpeakerTag.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Tag request sent to the channel' });
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getSpeakerAppearances.queryKey({
            channelId,
          }),
        });
      },
      onError: (error) =>
        showFailure({ message: error.message || 'Failed to send request' }),
    }),
  );

  const onAssign = async (assignments: QueueAssignment[]) => {
    await assignMutation.mutateAsync({ channelId, assignments });
  };
  const onCreateCluster = async (
    _channelId: string,
    name: string,
    members: ClusterCreate[],
  ) => {
    await clusterMutation.mutateAsync({ channelId, name, members });
  };
  const onRequest = async (
    speakerId: string,
    uploadId: string,
    speakerLabel: string,
  ) => {
    await requestMutation.mutateAsync({
      channelId,
      speakerId,
      uploadId,
      speakerLabel,
    });
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>Speaker labeling queue</Title>
        <Text c="dimmed" size="sm">
          Triage unlabeled diarized voices. Assigning attributes every paragraph
          of that voice in the upload and re-indexes it for search.
        </Text>
      </div>
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="matches">Matches ({data.queue.length})</Tabs.Tab>
          <Tabs.Tab value="groups">
            Unknown speakers ({data.clusters.length})
          </Tabs.Tab>
          <Tabs.Tab value="appearances">
            Appearances elsewhere
            {appearancesQuery.data
              ? ` (${appearancesQuery.data.appearances.length})`
              : ''}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="matches">
          <SpeakerLabelingQueue
            queue={data.queue}
            onAssign={onAssign}
            isAssigning={assignMutation.isPending}
          />
        </Tabs.Panel>
        <Tabs.Panel value="groups">
          <SpeakerClusters
            clusters={data.clusters}
            onCreate={onCreateCluster}
            isWorking={clusterMutation.isPending}
          />
        </Tabs.Panel>
        <Tabs.Panel value="appearances">
          {appearancesQuery.isLoading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : (
            <SpeakerAppearances
              appearances={appearancesQuery.data?.appearances ?? []}
              onRequest={onRequest}
              isRequesting={requestMutation.isPending}
            />
          )}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
