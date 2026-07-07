import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { LiveStreamingSettings } from '@/components/live-streaming-settings';
import { Title } from '@/components/ui';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute(
  '/_main/dashboard/channels_/$channelId_/live',
)({
  component: ChannelLivePage,
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
      trpc.dashboard.channels.getChannelForEdit.queryOptions({
        channelId: params.channelId,
      }),
    );
    return {
      backNavigation: {
        label: 'Back to channel',
        to: '/dashboard/channels/$channelId',
        params: { channelId: params.channelId },
      },
    };
  },
});

function ChannelLivePage() {
  const { channelId } = Route.useParams();
  const trpc = useTRPC();

  const { data: channel } = useSuspenseQuery(
    trpc.dashboard.channels.getChannelForEdit.queryOptions({ channelId }),
  );

  return (
    <div className="flex flex-col gap-5">
      <Title order={1}>{channel.name}</Title>
      <LiveStreamingSettings channelId={channelId} channelSlug={channel.slug} />
    </div>
  );
}
