import { createFileRoute, redirect } from '@tanstack/react-router';
import { EmptyState } from '@/components/empty-state';
import Header from '@/components/header';

export const Route = createFileRoute('/_main/$slug')({
  loader: async ({ params, context }) => {
    const result = await context.queryClient.fetchQuery(
      context.trpc.common.lookupSlug.queryOptions({ slug: params.slug }),
    );

    if (result.type === 'media') {
      throw redirect({ to: '/media/$mediaId', params: { mediaId: result.id } });
    }

    if (result.type === 'channel') {
      throw redirect({ to: '/channel/$slug', params: { slug: result.slug } });
    }

    // Return empty data - will render the NotFound component
    return {};
  },
  component: NotFoundComponent,
});

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1 items-center justify-center p-4">
        <EmptyState
          variant="error"
          emptyTitle="Seeking but Not Finding?"
          emptyBody="This page seems to have wandered off the narrow path. Let's get you back to the good news."
          emptyCta="Explore"
          emptyCtaHref="/"
        />
      </div>
    </div>
  );
}
