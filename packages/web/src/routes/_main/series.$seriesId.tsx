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

export const Route = createFileRoute('/_main/series/$seriesId')({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const { seriesId } = params;

    const [series, firstMediaThumbnailUrl] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.series.getPublicSeries.queryOptions({ seriesId }),
      ),
      context.queryClient.fetchQuery(
        context.trpc.series.getPublicSeriesFirstThumbnail.queryOptions({
          seriesId,
        }),
      ),
      context.queryClient.prefetchInfiniteQuery(
        context.trpc.series.getPublicSeriesMedia.infiniteQueryOptions({
          seriesId,
          limit: 20,
        }),
      ),
    ]);

    return {
      series,
      firstMediaThumbnailUrl,
    };
  },
  head: ({ loaderData }) => {
    const series = loaderData?.series;

    if (!series) {
      return {};
    }

    const title = `${series.title} - Let's Church`;
    const creator = series.channel
      ? series.channel.name
      : series.author.username;
    const description = `A series by ${creator} with ${series.mediaCount} ${series.mediaCount === 1 ? 'media' : 'media'}. Watch on Let's Church.`;
    const url =
      typeof window !== 'undefined'
        ? window.location.href
        : `https://lets.church/series/${series.id}`;

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
          href: `https://lets.church/series/${series.id}`,
        },
        {
          rel: 'alternate',
          type: 'application/rss+xml',
          title: `${series.title} - RSS Feed`,
          href: `https://lets.church/series/${series.id}/rss.xml`,
        },
      ],
    };
  },
});

function RouteComponent() {
  const { seriesId } = Route.useParams();
  const trpc = useTRPC();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data: series } = useSuspenseQuery(
    trpc.series.getPublicSeries.queryOptions({ seriesId }),
  );

  const {
    data: mediaData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...trpc.series.getPublicSeriesMedia.infiniteQueryOptions({
      seriesId,
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
      {/* Series Header */}
      <div className="mb-8">
        <h1 className="text-primary mb-4 text-3xl font-bold">{series.title}</h1>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          {series.channel ? (
            <LcLink
              to="/channel/$slug"
              params={{ slug: series.channel.slug }}
              className="flex items-center gap-2"
            >
              <Avatar
                src={series.channel.avatarUrl || undefined}
                alt={series.channel.name}
                className="border-fancy-pants size-8"
                fallbackClassName="bg-brand font-bold text-xs"
              />
              <span className="text-primary">{series.channel.name}</span>
            </LcLink>
          ) : (
            <div className="flex items-center gap-2">
              <Avatar
                src={series.author.avatarUrl || undefined}
                alt={series.author.username}
                className="border-fancy-pants size-8"
                fallbackClassName="bg-brand font-bold text-xs"
              />
              <span className="text-primary">{series.author.username}</span>
            </div>
          )}

          <span className="text-zinc-400">{series.mediaCount} media</span>

          <span className="text-zinc-400">
            Created {formatDistanceToNow(new Date(series.createdAt))} ago
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
          emptyTitle="No public media"
          emptyBody="This series doesn't have any public media yet."
          emptyCta="Browse Content"
          emptyCtaHref="/"
        />
      )}
    </MainLayout>
  );
}
