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

export const Route = createFileRoute('/_main/library')({
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.prefetchInfiniteQuery(
      context.trpc.library.getSavedMedia.infiniteQueryOptions({
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
    data: savedData,
    fetchNextPage: fetchNextSaved,
    hasNextPage: hasNextSaved,
    isFetchingNextPage: isFetchingNextSaved,
  } = useInfiniteQuery({
    ...trpc.library.getSavedMedia.infiniteQueryOptions({
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
          if (hasNextSaved && !isFetchingNextSaved) {
            fetchNextSaved();
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
  }, [hasNextSaved, isFetchingNextSaved, fetchNextSaved]);

  const savedItems =
    savedData?.pages.flatMap((page) => {
      if (page && typeof page === 'object' && 'items' in page) {
        return page.items;
      }
      return [];
    }) ?? [];

  const hasItems = savedItems.length > 0;

  return (
    <MainLayout>
      <div className="mb-6 px-4 sm:px-0">
        <h1 className="mb-4 font-bold text-2xl text-primary">Library</h1>
        <LibraryTabs activeTab="saved" />
      </div>

      {hasItems ? (
        <>
          <MediaGrid>
            {savedItems.map((upload) => (
              <MediaCard
                key={upload.id}
                mediaId={upload.id}
                title={upload.title}
                thumbnailUrl={upload.thumbnailUrl}
                channelName={upload.channel.name}
                channelAvatarUrl={upload.channel.avatarUrl}
              />
            ))}
          </MediaGrid>

          {/* Infinite scroll trigger */}
          <div ref={loadMoreRef} className="h-20" />

          {/* Loading indicator */}
          {isFetchingNextSaved ? (
            <div className="flex justify-center py-8">
              <div className="text-sm text-zinc-400">Loading more...</div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="px-4 sm:px-0">
          <EmptyState
            emptyTitle={
              !isLoggedIn
                ? 'Sign in to access your library'
                : "You haven't saved any content yet"
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
        </div>
      )}
    </MainLayout>
  );
}
