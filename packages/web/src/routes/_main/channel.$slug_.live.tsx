import { createFileRoute, redirect } from '@tanstack/react-router';

// /channel/<slug>/live — redirect to the channel's current in-progress (or most
// recent) live broadcast. Falls back to the channel page when there's none.
export const Route = createFileRoute('/_main/channel/$slug_/live')({
  loader: async ({ params, context }) => {
    const result = await context.queryClient.fetchQuery(
      context.trpc.channel.getLatestLiveStream.queryOptions({
        slug: params.slug,
      }),
    );

    if (result) {
      throw redirect({
        to: '/media/$mediaId',
        params: { mediaId: result.mediaId },
      });
    }

    throw redirect({ to: '/channel/$slug', params: { slug: params.slug } });
  },
  component: () => null,
});
