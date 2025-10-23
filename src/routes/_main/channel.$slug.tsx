import { Avatar } from '@base-ui-components/react/avatar';
import {
  useInfiniteQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import Header from '@/components/header';
import { MediaCard } from '@/components/media-card';
import { MediaGrid } from '@/components/media-grid';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { useSetBackgroundImage } from '@/stores/header';
import { trpcClient, useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/channel/$slug')({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const { slug } = params;

    const channelPromise = context.queryClient.ensureQueryData(
      context.trpc.channel.getChannelBySlug.queryOptions({ slug }),
    );

    // Fetch first page of media
    const mediaPromise = context.queryClient.prefetchInfiniteQuery(
      context.trpc.channel.getChannelMedia.infiniteQueryOptions({
        slug,
        limit: 20,
      }),
    );

    await Promise.all([channelPromise, mediaPromise]);

    return {};
  },
});

function RouteComponent() {
  const { slug } = Route.useParams();
  const isLoggedIn = useIsLoggedIn();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data: channel } = useSuspenseQuery(
    trpc.channel.getChannelBySlug.queryOptions({ slug }),
  );

  const {
    data: mediaData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...trpc.channel.getChannelMedia.infiniteQueryOptions({
      slug,
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

  // Local state for follow status with optimistic updates
  const [isFollowing, setIsFollowing] = useState(channel.isFollowing);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  useSetBackgroundImage(channel.defaultThumbnailUrl ?? undefined);

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

  const handleFollowToggle = async () => {
    if (!isLoggedIn || isTogglingFollow) return;

    setIsTogglingFollow(true);
    const previousState = isFollowing;

    // Optimistic update
    setIsFollowing(!isFollowing);

    try {
      if (isFollowing) {
        await trpcClient.home.unfollowChannel.mutate({ channelId: channel.id });
      } else {
        await trpcClient.home.followChannel.mutate({ channelId: channel.id });
      }

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({
        queryKey: trpc.channel.getChannelBySlug.queryKey({ slug }),
      });
      await queryClient.invalidateQueries({
        queryKey: trpc.home.getFollowedChannels.queryKey(),
      });
    } catch (_error) {
      // Revert on error
      setIsFollowing(previousState);
    } finally {
      setIsTogglingFollow(false);
    }
  };

  const mediaItems =
    mediaData?.pages.flatMap((page) => {
      if (page && typeof page === 'object' && 'items' in page) {
        return page.items;
      }
      return [];
    }) ?? [];

  const hasMedia = mediaItems.length > 0;

  return (
    <>
      <Header channelId={channel.id} />
      <div className="relative z-10 px-16 pb-8">
        {/* Channel Header */}
        <div className="mb-8 flex items-start gap-6">
          <Avatar.Root className="size-24 overflow-hidden rounded-full border-top-highlight">
            <Avatar.Image
              src={channel.avatarUrl || undefined}
              alt={channel.name}
              className="size-full object-cover"
            />
            <Avatar.Fallback className="flex size-full items-center justify-center rounded-full bg-indigo-500 font-bold text-3xl text-white">
              {channel.name.charAt(0).toUpperCase()}
            </Avatar.Fallback>
          </Avatar.Root>

          <div className="flex-1">
            <h1 className="mb-2 font-bold text-3xl text-primary">
              {channel.name}
            </h1>
            <p className="mb-3 text-sm text-zinc-400">
              {channel.subscriberCount.toLocaleString()}{' '}
              {channel.subscriberCount === 1 ? 'follower' : 'followers'}
            </p>

            {channel.description ? (
              <p className="mb-4 text-sm text-white/80 leading-relaxed">
                {channel.description}
              </p>
            ) : null}

            {isLoggedIn ? (
              <button
                type="button"
                onClick={handleFollowToggle}
                disabled={isTogglingFollow}
                className={
                  isFollowing
                    ? 'flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/15 px-4 font-semibold text-sm text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20 disabled:opacity-50'
                    : 'flex h-9 items-center justify-center rounded-full border-top-highlight bg-indigo-500 px-4 font-semibold text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50'
                }
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            ) : (
              <Link
                to="/auth/register"
                className="flex h-9 w-fit items-center justify-center rounded-full border-top-highlight bg-indigo-500 px-4 font-semibold text-sm text-white transition-opacity hover:opacity-90"
              >
                Follow
              </Link>
            )}
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
            emptyTitle="No content yet"
            emptyBody="This channel hasn't uploaded any content yet. Check back later!"
            emptyCta="Browse Content"
            emptyCtaHref="/"
          />
        )}
      </div>
    </>
  );
}
