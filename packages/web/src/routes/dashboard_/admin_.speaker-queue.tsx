import { Stack, Tabs, Text, Title } from '@mantine/core';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../-mantine';
import {
  type ClusterCreate,
  SpeakerClusters,
} from './-components/speaker-clusters';
import {
  type QueueAssignment,
  SpeakerLabelingQueue,
} from './-components/speaker-labeling-queue';

export const Route = createFileRoute('/dashboard_/admin_/speaker-queue')({
  component: AdminSpeakerQueuePage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );
    if (currentUser.role !== 'ADMIN') {
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.admin.getSpeakerLabelingQueue.queryOptions({}),
    );
    return {
      backNavigation: { label: 'Admin', to: '/dashboard/admin' },
    };
  },
});

function AdminSpeakerQueuePage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data } = useSuspenseQuery(
    trpc.dashboard.admin.getSpeakerLabelingQueue.queryOptions({}),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.dashboard.admin.getSpeakerLabelingQueue.queryKey({}),
    });

  const assignMutation = useMutation(
    trpc.dashboard.admin.assignSpeakerLabels.mutationOptions({
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
    trpc.dashboard.admin.createSpeakerFromCluster.mutationOptions({
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

  const onAssign = async (assignments: QueueAssignment[]) => {
    await assignMutation.mutateAsync({ assignments });
  };
  const onCreateCluster = async (
    channelId: string,
    name: string,
    members: ClusterCreate[],
  ) => {
    await clusterMutation.mutateAsync({ channelId, name, members });
  };
  const onAssignExistingCluster = async (
    speakerId: string,
    members: ClusterCreate[],
  ) => {
    await assignMutation.mutateAsync({
      assignments: members.map((m) => ({
        uploadId: m.uploadId,
        speakerLabel: m.speakerLabel,
        speakerId,
      })),
    });
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>Speaker labeling queue</Title>
        <Text c="dimmed" size="sm">
          Triage unlabeled diarized voices across every channel. Matches attach
          to existing speakers; unknown speakers let you name a new voice or
          pick an existing speaker (a recurring voice once, or a one-off on its
          own).
        </Text>
      </div>
      <Tabs defaultValue="matches" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="matches">Matches ({data.queue.length})</Tabs.Tab>
          <Tabs.Tab value="groups">
            Unknown speakers ({data.clusters.length})
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="matches">
          <SpeakerLabelingQueue
            queue={data.queue}
            onAssign={onAssign}
            isAssigning={assignMutation.isPending}
            showChannel
          />
        </Tabs.Panel>
        <Tabs.Panel value="groups">
          <SpeakerClusters
            clusters={data.clusters}
            onCreate={onCreateCluster}
            onAssignExisting={onAssignExistingCluster}
            isWorking={clusterMutation.isPending}
            isAssigning={assignMutation.isPending}
            showChannel
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
