import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, Loader, Tabs, Text, Title } from '@/components/ui';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';
import { SpeakerAppearances } from './-components/speaker-appearances';
import {
  type ClusterCreate,
  SpeakerClusters,
} from './-components/speaker-clusters';
import {
  type QueueAssignment,
  SpeakerLabelingQueue,
} from './-components/speaker-labeling-queue';

// Server-side page size for the bounded segment scan. Large channels can have
// tens of thousands of unlabeled voices; the queue procedure only scans (and
// runs kNN/clustering over) one page of the most-spoken segments at a time.
const PAGE_SIZE = 200;

export const Route = createFileRoute(
  '/_main/dashboard/channels_/$channelId_/speaker-queue',
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
        limit: PAGE_SIZE,
        offset: 0,
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

  // Server-driven pagination over the bounded segment scan. Changing the offset
  // re-suspends this query; React preserves component state across suspense.
  const [offset, setOffset] = useState(0);
  const { data } = useSuspenseQuery(
    trpc.dashboard.channels.getSpeakerLabelingQueue.queryOptions({
      channelId,
      limit: PAGE_SIZE,
      offset,
    }),
  );
  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;

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
  const [appearancesOffset, setAppearancesOffset] = useState(0);
  const appearancesQuery = useQuery({
    ...trpc.dashboard.channels.getSpeakerAppearances.queryOptions({
      channelId,
      limit: PAGE_SIZE,
      offset: appearancesOffset,
    }),
    enabled: tab === 'appearances',
  });
  const appearancesPageCount = Math.max(
    1,
    Math.ceil((appearancesQuery.data?.total ?? 0) / PAGE_SIZE),
  );
  const appearancesPage = Math.floor(appearancesOffset / PAGE_SIZE) + 1;

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

  const queuePagination =
    data.total > PAGE_SIZE ? (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <Text c="dimmed" size="sm">
          {data.total.toLocaleString()} unlabeled voices · showing the
          most-spoken {PAGE_SIZE} per page
        </Text>
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <Button
            variant="default"
            size="sm"
            disabled={page <= 1}
            onClick={() => setOffset((page - 2) * PAGE_SIZE)}
          >
            Previous
          </Button>
          <Text size="sm" c="dimmed">
            Page {page} of {pageCount}
          </Text>
          <Button
            variant="default"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setOffset(page * PAGE_SIZE)}
          >
            Next
          </Button>
        </nav>
      </div>
    ) : null;

  const appearancesPagination =
    (appearancesQuery.data?.total ?? 0) > PAGE_SIZE ? (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <Text c="dimmed" size="sm">
          {(appearancesQuery.data?.total ?? 0).toLocaleString()} cross-channel
          voices · {PAGE_SIZE} per page
        </Text>
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <Button
            variant="default"
            size="sm"
            disabled={appearancesPage <= 1}
            onClick={() =>
              setAppearancesOffset((appearancesPage - 2) * PAGE_SIZE)
            }
          >
            Previous
          </Button>
          <Text size="sm" c="dimmed">
            Page {appearancesPage} of {appearancesPageCount}
          </Text>
          <Button
            variant="default"
            size="sm"
            disabled={appearancesPage >= appearancesPageCount}
            onClick={() => setAppearancesOffset(appearancesPage * PAGE_SIZE)}
          >
            Next
          </Button>
        </nav>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Title order={1}>Speaker labeling queue</Title>
        <Text c="dimmed" size="sm">
          Triage unlabeled diarized voices. Assigning attributes every paragraph
          of that voice in the upload and re-indexes it for search.
        </Text>
      </div>
      <Tabs value={tab} onChange={(value) => setTab(value)}>
        <Tabs.List className="mb-4">
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
          {queuePagination}
        </Tabs.Panel>
        <Tabs.Panel value="groups">
          <SpeakerClusters
            clusters={data.clusters}
            onCreate={onCreateCluster}
            isWorking={clusterMutation.isPending}
          />
          {queuePagination}
        </Tabs.Panel>
        <Tabs.Panel value="appearances">
          {appearancesQuery.isLoading ? (
            <div className="flex flex-wrap items-center justify-center gap-4 py-8">
              <Loader />
            </div>
          ) : (
            <>
              <SpeakerAppearances
                appearances={appearancesQuery.data?.appearances ?? []}
                onRequest={onRequest}
                isRequesting={requestMutation.isPending}
              />
              {appearancesPagination}
            </>
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
