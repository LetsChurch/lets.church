import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useRef } from 'react';
import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import LcLink from '@/components/lc-link';
import MainLayout from '@/components/main-layout';
import { MediaCard } from '@/components/media-card';
import { MediaGrid } from '@/components/media-grid';
import { useTRPC } from '@/trpc/react';
import { formatTime } from '@/util/format';

export const Route = createFileRoute('/_main/playlist/$playlistId')({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const { playlistId } = params;

    const playlistPromise = context.queryClient.ensureQueryData(
      context.trpc.playlist.getPublicPlaylist.queryOptions({ playlistId }),
    );

    // Fetch first page of media
    const mediaPromise = context.queryClient.prefetchInfiniteQuery(
      context.trpc.playlist.getPublicPlaylistMedia.infiniteQueryOptions({
        playlistId,
        limit: 20,
      }),
    );

    await Promise.all([playlistPromise, mediaPromise]);

    return {};
  },
});

function RouteComponent() {
  const { playlistId } = Route.useParams();
  const trpc = useTRPC();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data: playlist } = useSuspenseQuery(
    trpc.playlist.getPublicPlaylist.queryOptions({ playlistId }),
  );

  const {
    data: mediaData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...trpc.playlist.getPublicPlaylistMedia.infiniteQueryOptions({
      playlistId,
      limit: 20,
    }),
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

  const mediaItems =
    mediaData?.pages.flatMap((page) => {
      if (page && typeof page === 'object' && 'items' in page) {
        return page.items;
      }
      return [];
    }) ?? [];

  const hasMedia = mediaItems.length > 0;

  return (
    <MainLayout containerClassName="px-16 pb-8">
      {/* Playlist Header */}
      <div className="mb-8">
        <h1 className="mb-4 font-bold text-3xl text-primary">
          {playlist.title}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Avatar
              src={playlist.author.avatarUrl || undefined}
              alt={playlist.author.username}
              className="size-8 border-fancy-pants"
              fallbackClassName="bg-brand font-bold text-xs"
            />
            <span className="text-primary">{playlist.author.username}</span>
          </div>

          <LcLink to="/channel/$slug" params={{ slug: playlist.channel.slug }}>
            {playlist.channel.name}
          </LcLink>

          <span className="text-zinc-400">
            {playlist.uploadCount}{' '}
            {playlist.uploadCount === 1 ? 'upload' : 'uploads'}
          </span>

          <span className="text-zinc-400">
            Created {formatDistanceToNow(new Date(playlist.createdAt))} ago
          </span>
        </div>
      </div>

      {/* Media Grid */}
      {hasMedia ? (
        <>
          <MediaGrid>
            {mediaItems.map((upload) => (
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
                timestamp={
                  upload.publishedAt
                    ? formatDistanceToNow(new Date(upload.publishedAt), {
                        addSuffix: true,
                      })
                    : undefined
                }
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
          emptyTitle="No public uploads"
          emptyBody="This playlist doesn't have any public uploads yet."
          emptyCta="Browse Content"
          emptyCtaHref="/"
        />
      )}
    </MainLayout>
  );
}
