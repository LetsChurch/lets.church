import {
  IconBuildingChurch,
  IconChevronRight,
  IconList,
  IconPlaylist,
} from '@tabler/icons-react';
import {
  useInfiniteQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import Header from '@/components/header';
import { MediaCard } from '@/components/media-card';
import { MediaGrid } from '@/components/media-grid';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { useSetBackgroundImage } from '@/stores/header';
import { trpcClient, useTRPC } from '@/trpc/react';
import { formatTime } from '@/util/format';

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

    // Prefetch playlists
    const playlistsPromise = context.queryClient.prefetchQuery(
      context.trpc.channel.getChannelPlaylists.queryOptions({ slug }),
    );

    // Prefetch churches
    const churchesPromise = context.queryClient.prefetchQuery(
      context.trpc.channel.getChannelChurches.queryOptions({ slug }),
    );

    await Promise.all([
      channelPromise,
      mediaPromise,
      playlistsPromise,
      churchesPromise,
    ]);

    return {};
  },
});

// Generate a consistent color based on a string hash
function getColorFromString(str: string): {
  from: string;
  via: string;
  to: string;
} {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Define color palettes (hue ranges for pleasant gradients)
  const palettes = [
    // Indigo/Purple
    { from: 'from-indigo-600', via: 'via-purple-600', to: 'to-indigo-700' },
    // Blue/Cyan
    { from: 'from-blue-600', via: 'via-cyan-600', to: 'to-blue-700' },
    // Teal/Green
    { from: 'from-teal-600', via: 'via-green-600', to: 'to-teal-700' },
    // Purple/Pink
    { from: 'from-purple-600', via: 'via-pink-600', to: 'to-purple-700' },
    // Rose/Orange
    { from: 'from-rose-600', via: 'via-orange-600', to: 'to-rose-700' },
    // Violet/Fuchsia
    { from: 'from-violet-600', via: 'via-fuchsia-600', to: 'to-violet-700' },
    // Emerald/Lime
    { from: 'from-emerald-600', via: 'via-lime-600', to: 'to-emerald-700' },
    // Sky/Blue
    { from: 'from-sky-600', via: 'via-blue-600', to: 'to-sky-700' },
  ];

  // Use hash to select a palette
  const index = Math.abs(hash) % palettes.length;
  return palettes[index];
}

function RouteComponent() {
  const { slug } = Route.useParams();
  const isLoggedIn = useIsLoggedIn();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data: channel } = useSuspenseQuery(
    trpc.channel.getChannelBySlug.queryOptions({ slug }),
  );

  const { data: playlists } = useSuspenseQuery(
    trpc.channel.getChannelPlaylists.queryOptions({ slug }),
  );

  const { data: churches } = useSuspenseQuery(
    trpc.channel.getChannelChurches.queryOptions({ slug }),
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

  const headerColors = getColorFromString(channel.name);
  const darkHeaderColors = {
    from: headerColors.from.replace('-600', '-900'),
    via: headerColors.via.replace('-600', '-900'),
    to: headerColors.to.replace('-700', '-950'),
  };

  const hasSidebarContent =
    (churches && churches.length > 0) || (playlists && playlists.length > 0);

  return (
    <div className="min-h-screen bg-linear-to-br from-zinc-50 via-white to-indigo-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-indigo-950/20">
      {/* Cover Image or Gradient Header */}
      <div className="relative">
        {channel.coverUrl ? (
          <div className="h-80 overflow-hidden">
            <img
              src={channel.coverUrl}
              alt=""
              className="size-full object-cover"
            />
          </div>
        ) : (
          <div
            className={`h-48 overflow-hidden bg-linear-to-br ${headerColors.from} ${headerColors.via} ${headerColors.to} dark:${darkHeaderColors.from} dark:${darkHeaderColors.via} dark:${darkHeaderColors.to}`}
          >
            <div className="absolute inset-0 bg-linear-to-b from-transparent to-black/10 dark:to-black/20" />
            <div className="absolute inset-0 opacity-20">
              <svg
                className="size-full"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <defs>
                  <pattern
                    id="grid"
                    width="32"
                    height="32"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 32 0 L 0 0 0 32"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.5"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
          </div>
        )}

        {/* Header overlay with gradient */}
        <div className="absolute inset-x-0 top-0">
          <div className="absolute inset-0 bg-linear-to-b from-black/50 via-black/30 to-transparent" />
          <div className="relative">
            <Header
              channelSlug={channel.slug}
              searchPlaceholder={`Search in ${channel.name}...`}
              showBlurredBackground={false}
              variant="light"
            />
          </div>
        </div>
      </div>

      <div className="isolate mx-auto max-w-5xl px-6 pb-24">
        {/* Profile Header */}
        <div className="-mt-12 sm:-mt-16 mb-8 sm:mb-12">
          <div className="flex items-center overflow-hidden rounded-full border-fancy-pants bg-white shadow-lg dark:bg-zinc-900">
            <Avatar
              src={channel.avatarUrl || undefined}
              alt={channel.name}
              className="size-20 shrink-0 sm:size-32 lg:size-40"
              fallbackClassName="text-xl sm:text-3xl lg:text-4xl"
            />
            <div className="flex flex-1 flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-6">
              <div className="min-w-0 flex-1">
                <h1 className="font-bold text-xl text-zinc-900 tracking-tight sm:text-3xl lg:text-4xl dark:text-white">
                  {channel.name}
                </h1>
                <p className="mt-1 text-sm text-zinc-400">
                  {channel.subscriberCount.toLocaleString()}{' '}
                  {channel.subscriberCount === 1 ? 'follower' : 'followers'}
                </p>
              </div>

              {isLoggedIn ? (
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  disabled={isTogglingFollow}
                  className={
                    isFollowing
                      ? 'flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/15 px-4 font-semibold text-primary/80 text-sm backdrop-blur-sm transition-colors hover:bg-white/20 disabled:opacity-50'
                      : 'flex h-9 items-center justify-center rounded-full border-fancy-pants bg-brand px-4 font-semibold text-primary text-sm transition-opacity hover:opacity-90 disabled:opacity-50'
                  }
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              ) : (
                <Link
                  to="/auth/register"
                  className="flex h-9 w-fit items-center justify-center rounded-full border-fancy-pants bg-brand px-4 font-semibold text-sm text-white transition-opacity hover:opacity-90"
                >
                  Follow
                </Link>
              )}
            </div>
          </div>
        </div>

        <div
          className={
            hasSidebarContent ? 'grid gap-8 lg:grid-cols-3' : 'space-y-8'
          }
        >
          {/* Main Content */}
          <div
            className={
              hasSidebarContent ? 'space-y-8 lg:col-span-2' : 'space-y-8'
            }
          >
            {/* Description */}
            {channel.description ? (
              <section className="rounded-2xl border-fancy-pants bg-zinc-100 p-5 dark:bg-zinc-900">
                <h2 className="mb-4 font-medium text-primary text-sm">About</h2>
                <p className="whitespace-pre-wrap text-lg text-secondary leading-relaxed">
                  {channel.description}
                </p>
              </section>
            ) : null}

            {/* All Content */}
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
                emptyTitle="No content yet"
                emptyBody="This channel hasn't uploaded any content yet. Check back later!"
                emptyCta="Browse Content"
                emptyCtaHref="/"
              />
            )}
          </div>

          {/* Sidebar */}
          {hasSidebarContent ? (
            <div className="space-y-6 lg:col-span-1">
              {/* Associated Churches */}
              {churches && churches.length > 0 ? (
                <section className="rounded-2xl border-fancy-pants bg-zinc-100 p-5 dark:bg-zinc-900">
                  <h2 className="mb-4 flex items-center gap-2 font-medium text-primary text-sm">
                    <IconBuildingChurch size={16} strokeWidth={2} />
                    {churches.length === 1 ? 'Church' : 'Churches'}
                  </h2>
                  <div className="space-y-3">
                    {churches.map((church) => {
                      return (
                        <Link
                          key={church.id}
                          to="/churches/$slug"
                          params={{ slug: church.slug }}
                          className="group flex items-start gap-3 rounded-xl bg-zinc-50/50 p-3 transition-all hover:shadow-md dark:bg-zinc-800/50"
                        >
                          <Avatar
                            src={church.avatarUrl || undefined}
                            alt={church.name}
                            className="size-12 shrink-0"
                            fallbackClassName="text-sm"
                          />
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-semibold text-primary">
                              {church.name}
                            </h3>
                            <p className="text-secondary text-xs">
                              {church.isOfficial ? 'Official' : 'Endorsed'}
                            </p>
                          </div>
                          <IconChevronRight
                            className="mt-1 shrink-0 text-muted"
                            size={16}
                          />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {/* Playlists */}
              {playlists && playlists.length > 0 ? (
                <section className="rounded-2xl border-fancy-pants bg-zinc-100 p-5 dark:bg-zinc-900">
                  <h2 className="mb-4 flex items-center gap-2 font-medium text-primary text-sm">
                    <IconList size={16} strokeWidth={2} />
                    Playlists
                  </h2>
                  <div className="space-y-3">
                    {playlists.map((playlist) => (
                      <Link
                        key={playlist.id}
                        to="/playlist/$playlistId"
                        params={{ playlistId: playlist.id }}
                        className="group flex gap-3 rounded-xl bg-zinc-50/50 p-3 transition-all hover:shadow-md dark:bg-zinc-800/50"
                      >
                        {playlist.thumbnailUrl ? (
                          <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-lg">
                            <img
                              src={playlist.thumbnailUrl}
                              alt=""
                              className="size-full object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                              <IconPlaylist
                                size={20}
                                className="text-white"
                                strokeWidth={2}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex aspect-video w-20 shrink-0 items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-700">
                            <IconPlaylist
                              size={20}
                              className="text-zinc-400 dark:text-zinc-500"
                              strokeWidth={2}
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold text-primary text-sm">
                            {playlist.title}
                          </h3>
                          <p className="text-secondary text-xs">
                            {playlist.uploadCount}{' '}
                            {playlist.uploadCount === 1 ? 'video' : 'videos'}
                          </p>
                          <p className="text-muted text-xs">
                            {playlist.type === 'SERIES' ? 'Series' : 'Playlist'}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
