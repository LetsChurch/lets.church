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

    const [playlist, firstMediaThumbnailUrl] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.playlist.getPublicPlaylist.queryOptions({ playlistId }),
      ),
      context.queryClient.fetchQuery(
        context.trpc.playlist.getPublicPlaylistFirstThumbnail.queryOptions({
          playlistId,
        }),
      ),
      context.queryClient.prefetchInfiniteQuery(
        context.trpc.playlist.getPublicPlaylistMedia.infiniteQueryOptions({
          playlistId,
          limit: 20,
        }),
      ),
    ]);

    return {
      playlist,
      firstMediaThumbnailUrl,
    };
  },
  head: ({ loaderData }) => {
    const playlist = loaderData?.playlist;

    if (!playlist) {
      return {};
    }

    const title = `${playlist.title} - Let's Church`;
    const creator = playlist.channel
      ? playlist.channel.name
      : playlist.author.username;
    const description = `A playlist by ${creator} with ${playlist.uploadCount} ${playlist.uploadCount === 1 ? 'upload' : 'uploads'}. Watch on Let's Church.`;
    const url =
      typeof window !== 'undefined'
        ? window.location.href
        : `https://lets.church/playlist/${playlist.id}`;

    const fallbackImageUrl =
      loaderData?.firstMediaThumbnailUrl || 'https://lets.church/og-image.png';

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
        ...(playlist.visibility === 'UNLISTED'
          ? [
              {
                name: 'robots',
                content: 'noindex, nofollow',
              },
            ]
          : []),
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
          content: fallbackImageUrl,
        },
        {
          property: 'og:image:width',
          content: '1280',
        },
        {
          property: 'og:image:height',
          content: '720',
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
          content: fallbackImageUrl,
        },
      ],
      links: [
        {
          rel: 'canonical',
          href: `https://lets.church/playlist/${playlist.id}`,
        },
        ...(playlist.visibility === 'PUBLIC'
          ? [
              {
                rel: 'alternate',
                type: 'application/rss+xml',
                title: `${playlist.title} - RSS Feed`,
                href: `https://lets.church/playlist/${playlist.id}/rss.xml`,
              },
            ]
          : []),
      ],
    };
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
        <h1 className="text-primary mb-4 text-3xl font-bold">
          {playlist.title}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          {playlist.channel ? (
            <LcLink
              to="/channel/$slug"
              params={{ slug: playlist.channel.slug }}
              className="flex items-center gap-2"
            >
              <Avatar
                src={playlist.channel.avatarUrl || undefined}
                alt={playlist.channel.name}
                className="border-fancy-pants size-8"
                fallbackClassName="bg-brand font-bold text-xs"
              />
              <span className="text-primary">{playlist.channel.name}</span>
            </LcLink>
          ) : (
            <div className="flex items-center gap-2">
              <Avatar
                src={playlist.author.avatarUrl || undefined}
                alt={playlist.author.username}
                className="border-fancy-pants size-8"
                fallbackClassName="bg-brand font-bold text-xs"
              />
              <span className="text-primary">{playlist.author.username}</span>
            </div>
          )}

          <span className="text-zinc-400">
            {playlist.uploadCount}{' '}
            {playlist.uploadCount === 1 ? 'upload' : 'uploads'}
          </span>

          {playlist.visibility === 'UNLISTED' ? (
            <span className="text-zinc-400">Unlisted</span>
          ) : null}

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
                playlistId={playlistId}
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
          emptyTitle="No available uploads"
          emptyBody="This playlist doesn't have any available uploads yet."
          emptyCta="Browse Content"
          emptyCtaHref="/"
        />
      )}
    </MainLayout>
  );
}
