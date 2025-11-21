import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { EmptyState } from '@/components/empty-state';
import { LibraryTabs } from '@/components/library-tabs';
import MainLayout from '@/components/main-layout';
import { MediaCard } from '@/components/media-card';
import { MediaGrid } from '@/components/media-grid';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { useTRPC } from '@/trpc/react';
import { formatTime } from '@/util/format';

export const Route = createFileRoute('/_main/history')({
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.prefetchInfiniteQuery(
      context.trpc.library.getHistory.infiniteQueryOptions({
        limit: 20,
      }),
    );
  },
});

function RouteComponent() {
  const isLoggedIn = useIsLoggedIn();
  const trpc = useTRPC();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data: historyData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...trpc.library.getHistory.infiniteQueryOptions({
      limit: 20,
    }),
    enabled: isLoggedIn,
    getNextPageParam: (lastPage) => {
      if (
        lastPage &&
        typeof lastPage === 'object' &&
        'nextCursor' in lastPage
      ) {
        return lastPage.nextCursor;
      }
      return null;
    },
    initialPageParam: null as string | null,
  });

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target?.isIntersecting) {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0,
      },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const historyItems =
    historyData?.pages.flatMap((page) => {
      if (page && typeof page === 'object' && 'items' in page) {
        return page.items;
      }
      return [];
    }) ?? [];

  const hasItems = historyItems.length > 0;

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="mb-4 font-bold text-2xl text-primary">Library</h1>
        <LibraryTabs activeTab="history" />
      </div>

      {hasItems ? (
        <>
          <MediaGrid>
            {historyItems.map((upload) => (
              <MediaCard
                key={upload.id}
                mediaId={upload.id}
                title={upload.title}
                thumbnailUrl={upload.thumbnailUrl}
                channelName={upload.channel.name}
                channelAvatarUrl={upload.channel.avatarUrl}
                duration={
                  upload.lengthSeconds
                    ? formatTime(upload.lengthSeconds * 1000)
                    : undefined
                }
                progress={upload.progress}
              />
            ))}
          </MediaGrid>

          {/* Infinite scroll trigger */}
          <div ref={loadMoreRef} className="h-20" />

          {/* Loading indicator */}
          {isFetchingNextPage ? (
            <div className="flex justify-center py-8">
              <div className="text-sm text-zinc-400">Loading more...</div>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          emptyTitle={
            !isLoggedIn
              ? 'Sign in to access your history'
              : "You haven't watched any content yet"
          }
          emptyBody="Save videos to watch later, catalog your favorite content, track your watch history—and then easily search it all!"
          {...(!isLoggedIn
            ? {
                emptyCta: 'Sign In',
                emptyCtaHref: '/auth/login',
              }
            : {
                emptyCta: 'Browse Content',
                emptyCtaHref: '/',
              })}
        />
      )}
    </MainLayout>
  );
}
