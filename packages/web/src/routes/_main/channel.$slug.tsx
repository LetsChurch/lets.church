import {
  IconBrandApplePodcast,
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandSpotify,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube,
  IconBuildingChurch,
  IconChevronRight,
  IconPlaylist,
  IconRss,
  IconWorld,
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
import ChannelTabs from '@/components/channel-tabs';
import { EmptyState } from '@/components/empty-state';
import { FollowButton } from '@/components/follow-button';
import Header from '@/components/header';
import { MediaCard } from '@/components/media-card';
import { MediaGrid } from '@/components/media-grid';
import { getPillButtonClasses } from '@/components/pill-button';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { useSetBackgroundImage } from '@/stores/header';
import { trpcClient, useTRPC } from '@/trpc/react';
import { formatTime } from '@/util/format';
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '@/util/image-sizes';

export const Route = createFileRoute('/_main/channel/$slug')({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const { slug } = params;

    const channel = await context.queryClient.ensureQueryData(
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

    await Promise.all([mediaPromise, playlistsPromise, churchesPromise]);

    return {
      channel,
    };
  },
  head: ({ loaderData }) => {
    const channel = loaderData?.channel;

    if (!channel) {
      return {};
    }

    const title = `${channel.name} - Let's Church`;
    const description = channel.description
      ? `${channel.description.slice(0, 160)}${channel.description.length > 160 ? '...' : ''}`
      : `Watch sermons and content from ${channel.name} on Let's Church. ${channel.subscriberCount} ${channel.subscriberCount === 1 ? 'follower' : 'followers'}.`;
    const url =
      typeof window !== 'undefined'
        ? window.location.href
        : `https://lets.church/channel/${channel.slug}`;

    const imageUrl =
      channel.defaultThumbnailUrl ||
      channel.avatarUrl ||
      'https://lets.church/og-image.png';

    return {
      meta: [
        // Basic meta tags
        {
          title,
        },
        {
          name: 'description',
          content: description,
        },
        // OpenGraph tags
        {
          property: 'og:url',
          content: url,
        },
        {
          property: 'og:type',
          content: 'website',
        },
        {
          property: 'og:title',
          content: title,
        },
        {
          property: 'og:description',
          content: description,
        },
        {
          property: 'og:image',
          content: imageUrl,
        },
        {
          property: 'og:image:width',
          content: OG_IMAGE_WIDTH.toString(),
        },
        {
          property: 'og:image:height',
          content: OG_IMAGE_HEIGHT.toString(),
        },
        {
          property: 'og:site_name',
          content: "Let's Church",
        },
        // Twitter Card tags
        {
          name: 'twitter:card',
          content: 'summary_large_image',
        },
        {
          property: 'twitter:domain',
          content: 'lets.church',
        },
        {
          property: 'twitter:url',
          content: url,
        },
        {
          name: 'twitter:title',
          content: title,
        },
        {
          name: 'twitter:description',
          content: description,
        },
        {
          name: 'twitter:image',
          content: imageUrl,
        },
      ],
      links: [
        {
          rel: 'canonical',
          href: `https://lets.church/channel/${channel.slug}`,
        },
      ],
    };
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

  const { data: allLists } = useSuspenseQuery(
    trpc.channel.getChannelPlaylists.queryOptions({ slug }),
  );

  // Separate playlists and series
  const playlists = allLists.filter((list) => list.type === 'PLAYLIST');
  const series = allLists.filter((list) => list.type === 'SERIES');

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

  // Tab state
  const [activeTab, setActiveTab] = useState<
    'videos' | 'playlists' | 'series' | 'links'
  >('videos');

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

  const hasSocialLinks =
    channel.websiteUrl ||
    channel.facebookUrl ||
    channel.instagramUrl ||
    channel.xUrl ||
    channel.youtubeUrl ||
    channel.tiktokUrl ||
    channel.linkedinUrl ||
    channel.threadsUrl ||
    channel.applePodcastsUrl ||
    channel.spotifyUrl ||
    channel.rssUrl;

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

      <div className="isolate mx-auto max-w-7xl px-6 pb-24">
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
                <FollowButton
                  onClick={handleFollowToggle}
                  disabled={isTogglingFollow}
                  isFollowing={isFollowing}
                />
              ) : (
                <Link
                  to="/auth/register"
                  className={getPillButtonClasses({ size: 'lg' })}
                >
                  Follow
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {channel.description ? (
          <div className="mb-8">
            <p className="whitespace-pre-wrap text-lg text-secondary leading-relaxed">
              {channel.description}
            </p>
          </div>
        ) : null}

        {/* Tabs */}
        <div className="mb-8">
          <ChannelTabs
            activeTab={activeTab}
            videoCount={mediaItems.length}
            playlistCount={playlists.length}
            seriesCount={series.length}
            onTabChange={setActiveTab}
          />
        </div>

        {/* Tab Content */}
        <div className="space-y-8">
          {/* Videos Tab */}
          {activeTab === 'videos' ? (
            hasMedia ? (
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
            )
          ) : null}

          {/* Playlists Tab */}
          {activeTab === 'playlists' ? (
            playlists && playlists.length > 0 ? (
              <MediaGrid>
                {playlists.map((playlist) => {
                  return (
                    <Link
                      key={playlist.id}
                      to="/playlist/$playlistId"
                      params={{ playlistId: playlist.id }}
                      className="group flex flex-col rounded-2xl border-fancy-pants bg-zinc-100 p-4 transition-all hover:shadow-md dark:bg-zinc-900"
                    >
                      {playlist.thumbnailUrl ? (
                        <div className="relative aspect-video w-full overflow-hidden rounded-lg">
                          <img
                            src={playlist.thumbnailUrl}
                            alt=""
                            className="size-full object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <IconPlaylist
                              size={32}
                              className="text-white"
                              strokeWidth={2}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-700">
                          <IconPlaylist
                            size={32}
                            className="text-zinc-400 dark:text-zinc-500"
                            strokeWidth={2}
                          />
                        </div>
                      )}
                      <div className="mt-3 min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-primary">
                          {playlist.title}
                        </h3>
                        <p className="text-secondary text-sm">
                          {playlist.uploadCount}{' '}
                          {playlist.uploadCount === 1 ? 'video' : 'videos'}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </MediaGrid>
            ) : (
              <EmptyState
                emptyTitle="No playlists yet"
                emptyBody="This channel hasn't created any playlists yet."
                emptyCta="Browse Content"
                emptyCtaHref="/"
              />
            )
          ) : null}

          {/* Series Tab */}
          {activeTab === 'series' ? (
            series && series.length > 0 ? (
              <MediaGrid>
                {series.map((seriesItem) => {
                  return (
                    <Link
                      key={seriesItem.id}
                      to="/series/$seriesId"
                      params={{ seriesId: seriesItem.id }}
                      className="group flex flex-col rounded-2xl border-fancy-pants bg-zinc-100 p-4 transition-all hover:shadow-md dark:bg-zinc-900"
                    >
                      {seriesItem.thumbnailUrl ? (
                        <div className="relative aspect-video w-full overflow-hidden rounded-lg">
                          <img
                            src={seriesItem.thumbnailUrl}
                            alt=""
                            className="size-full object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <IconPlaylist
                              size={32}
                              className="text-white"
                              strokeWidth={2}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-700">
                          <IconPlaylist
                            size={32}
                            className="text-zinc-400 dark:text-zinc-500"
                            strokeWidth={2}
                          />
                        </div>
                      )}
                      <div className="mt-3 min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-primary">
                          {seriesItem.title}
                        </h3>
                        <p className="text-secondary text-sm">
                          {seriesItem.uploadCount}{' '}
                          {seriesItem.uploadCount === 1 ? 'video' : 'videos'}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </MediaGrid>
            ) : (
              <EmptyState
                emptyTitle="No series yet"
                emptyBody="This channel hasn't created any series yet."
                emptyCta="Browse Content"
                emptyCtaHref="/"
              />
            )
          ) : null}

          {/* Links Tab */}
          {activeTab === 'links' ? (
            churches.length > 0 || hasSocialLinks ? (
              <div className="mx-auto max-w-4xl space-y-8">
                {/* Associated Churches */}
                {churches && churches.length > 0 ? (
                  <section className="rounded-2xl border-fancy-pants bg-zinc-100 p-6 dark:bg-zinc-900">
                    <h2 className="mb-4 flex items-center gap-2 font-semibold text-primary text-xl">
                      <IconBuildingChurch size={20} strokeWidth={2} />
                      {churches.length === 1 ? 'Church' : 'Churches'}
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2">
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

                {/* Social Media & Website */}
                {hasSocialLinks ? (
                  <section className="rounded-2xl border-fancy-pants bg-zinc-100 p-6 dark:bg-zinc-900">
                    <h2 className="mb-4 flex items-center gap-2 font-semibold text-primary text-xl">
                      <IconWorld size={20} strokeWidth={2} />
                      Links
                    </h2>
                    <div className="space-y-3">
                      {channel.websiteUrl ? (
                        <a
                          href={channel.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-white/5"
                        >
                          <IconWorld
                            size={20}
                            className="mt-0.5 shrink-0 text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                            strokeWidth={1.5}
                          />
                          <span className="break-all text-secondary text-sm group-hover:text-indigo-600 dark:group-hover:text-white">
                            {channel.websiteUrl.replace(/^https?:\/\//, '')}
                          </span>
                        </a>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {channel.facebookUrl ? (
                          <a
                            href={channel.facebookUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex size-10 items-center justify-center rounded-lg bg-white/50 transition-all hover:bg-white/5 dark:bg-zinc-800/50"
                            title="Facebook"
                          >
                            <IconBrandFacebook
                              size={20}
                              className="text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                              strokeWidth={1.5}
                            />
                          </a>
                        ) : null}
                        {channel.instagramUrl ? (
                          <a
                            href={channel.instagramUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex size-10 items-center justify-center rounded-lg bg-white/50 transition-all hover:bg-white/5 dark:bg-zinc-800/50"
                            title="Instagram"
                          >
                            <IconBrandInstagram
                              size={20}
                              className="text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                              strokeWidth={1.5}
                            />
                          </a>
                        ) : null}
                        {channel.xUrl ? (
                          <a
                            href={channel.xUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex size-10 items-center justify-center rounded-lg bg-white/50 transition-all hover:bg-white/5 dark:bg-zinc-800/50"
                            title="X (Twitter)"
                          >
                            <IconBrandX
                              size={20}
                              className="text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                              strokeWidth={1.5}
                            />
                          </a>
                        ) : null}
                        {channel.youtubeUrl ? (
                          <a
                            href={channel.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex size-10 items-center justify-center rounded-lg bg-white/50 transition-all hover:bg-white/5 dark:bg-zinc-800/50"
                            title="YouTube"
                          >
                            <IconBrandYoutube
                              size={20}
                              className="text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                              strokeWidth={1.5}
                            />
                          </a>
                        ) : null}
                        {channel.tiktokUrl ? (
                          <a
                            href={channel.tiktokUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex size-10 items-center justify-center rounded-lg bg-white/50 transition-all hover:bg-white/5 dark:bg-zinc-800/50"
                            title="TikTok"
                          >
                            <IconBrandTiktok
                              size={20}
                              className="text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                              strokeWidth={1.5}
                            />
                          </a>
                        ) : null}
                        {channel.linkedinUrl ? (
                          <a
                            href={channel.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex size-10 items-center justify-center rounded-lg bg-white/50 transition-all hover:bg-white/5 dark:bg-zinc-800/50"
                            title="LinkedIn"
                          >
                            <IconBrandLinkedin
                              size={20}
                              className="text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                              strokeWidth={1.5}
                            />
                          </a>
                        ) : null}
                        {channel.threadsUrl ? (
                          <a
                            href={channel.threadsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex size-10 items-center justify-center rounded-lg bg-white/50 transition-all hover:bg-white/5 dark:bg-zinc-800/50"
                            title="Threads"
                          >
                            <IconBrandThreads
                              size={20}
                              className="text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                              strokeWidth={1.5}
                            />
                          </a>
                        ) : null}
                        {channel.applePodcastsUrl ? (
                          <a
                            href={channel.applePodcastsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex size-10 items-center justify-center rounded-lg bg-white/50 transition-all hover:bg-white/5 dark:bg-zinc-800/50"
                            title="Apple Podcasts"
                          >
                            <IconBrandApplePodcast
                              size={20}
                              className="text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                              strokeWidth={1.5}
                            />
                          </a>
                        ) : null}
                        {channel.spotifyUrl ? (
                          <a
                            href={channel.spotifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex size-10 items-center justify-center rounded-lg bg-white/50 transition-all hover:bg-white/5 dark:bg-zinc-800/50"
                            title="Spotify"
                          >
                            <IconBrandSpotify
                              size={20}
                              className="text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                              strokeWidth={1.5}
                            />
                          </a>
                        ) : null}
                        {channel.rssUrl ? (
                          <a
                            href={channel.rssUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex size-10 items-center justify-center rounded-lg bg-white/50 transition-all hover:bg-white/5 dark:bg-zinc-800/50"
                            title="RSS Feed"
                          >
                            <IconRss
                              size={20}
                              className="text-secondary group-hover:text-indigo-600 dark:group-hover:text-white"
                              strokeWidth={1.5}
                            />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </section>
                ) : null}
              </div>
            ) : (
              <EmptyState
                emptyTitle="No links available"
                emptyBody="This channel has no associated churches or social links."
              />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
