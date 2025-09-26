import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { EmptyState } from '@/components/empty-state';
import Header from '@/components/header';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/following')({
  component: RouteComponent,
});

function RouteComponent() {
  const trpc = useTRPC();
  const hasSessionQuery = useQuery(trpc.common.hasValidSession.queryOptions());

  return (
    <>
      <Header />
      <div className="px-16 py-8">
        {hasSessionQuery.data ? (
          <EmptyState
            emptyTitle="You're not following any channels yet"
            emptyBody="Follow your favorite channels to get a customized feed and to ensure you don't miss new content!"
          />
        ) : (
          <EmptyState
            emptyTitle="Create an account to follow channels"
            emptyBody="Follow your favorite channels to get a customized feed and to ensure you don't miss new content!"
            emptyCta="Create Account"
          />
        )}
      </div>
    </>
  );
}
