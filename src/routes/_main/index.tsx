import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { EmblaCarouselType } from 'embla-carousel';
import useEmblaCarousel from 'embla-carousel-react';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { CarouselNavigationButtons } from '@/components/carousel-navigation-buttons';
import { DonateCard } from '@/components/donate-card';
import { EmptyState } from '@/components/empty-state';
import Header from '@/components/header';
import HeroCarousel from '@/components/hero-carousel';
import { MediaCard } from '@/components/media-card';
import { MediaCarousel } from '@/components/media-carousel';
import { MediaCompactCard } from '@/components/media-compact-card';
import { MediaGrid } from '@/components/media-grid';
import { SearchCard } from '@/components/search-card';
import { TrendingSearchPill } from '@/components/trending-search-pill';
import { ViewMoreCard } from '@/components/view-more-card';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/')({
  component: Home,
  loader: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );

    await context.queryClient.ensureQueryData(
      context.trpc.home.getTrendingUploads.queryOptions({ limit: 20 }),
    );

    if (hasSession) {
      await context.queryClient.ensureQueryData(
        context.trpc.home.getSubscriptionUploads.queryOptions({ limit: 5 }),
      );
    }

    return {};
  },
});

function ContentSection({
  title,
  uploads,
  showViewAll = true,
  showViewMoreCard = false,
  viewMoreCardText,
  emptyTitle,
  emptyBody,
  emptyCta,
  loggedOutEmptyTitle,
  loggedOutEmptyBody,
  loggedOutEmptyCta,
  isLoggedIn,
}: {
  title: string;
  emptyTitle?: string;
  emptyBody?: string;
  emptyCta?: string;
  loggedOutEmptyTitle?: string;
  loggedOutEmptyBody?: string;
  loggedOutEmptyCta?: string;
  isLoggedIn?: boolean;
  uploads: Array<{
    id: string;
    title?: string | null;
    thumbnailUrl?: string | null;
    channel: {
      name: string;
      avatarUrl?: string | null;
    };
  }>;
  showViewAll?: boolean;
  showViewMoreCard?: boolean;
  viewMoreCardText?: string;
}) {
  const carouselItems = uploads.map((upload) => ({
    id: upload.id,
    title: upload.title,
    thumbnailUrl: upload.thumbnailUrl,
    channelName: upload.channel.name,
    channelAvatarUrl: upload.channel.avatarUrl,
  }));

  return (
    <div className="mb-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-medium text-lg text-primary">{title}</h2>
        {showViewAll && uploads.length > 0 ? (
          <button
            type="button"
            className="text-muted text-sm transition-colors hover:text-primary"
          >
            View history
          </button>
        ) : null}
      </div>

      {uploads.length > 0 ? (
        <MediaCarousel
          items={carouselItems}
          showPagination
          tailerCard={
            showViewMoreCard && viewMoreCardText ? (
              <ViewMoreCard text={viewMoreCardText} />
            ) : undefined
          }
        />
      ) : (
        <EmptyState
          emptyTitle={isLoggedIn === false ? loggedOutEmptyTitle : emptyTitle}
          emptyBody={isLoggedIn === false ? loggedOutEmptyBody : emptyBody}
          emptyCta={isLoggedIn === false ? loggedOutEmptyCta : emptyCta}
        />
      )}
    </div>
  );
}

function RecentlySaved() {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'start',
    containScroll: 'trimSnaps',
    slidesToScroll: 1,
    watchDrag: false,
    breakpoints: {
      '(max-width: 1023px)': { watchDrag: true },
    },
  });

  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    function onSelect(emblaApi: EmblaCarouselType) {
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    }

    onSelect(emblaApi);
    emblaApi.on('select', onSelect);

    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  const savedItems = [...Array(9)].map((_item, i) => `Saved Content ${i + 1}`);

  const column1 = savedItems.slice(0, 3);
  const column2 = savedItems.slice(3, 6);
  const column3 = savedItems.slice(6, 9);

  return (
    <div className="mb-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-medium text-lg text-primary">Recently Saved</h2>
        <button
          type="button"
          className="text-muted text-sm transition-colors hover:text-primary"
        >
          View all
        </button>
      </div>

      <div className="relative">
        <div
          className="-mx-16 relative overflow-visible px-16"
          ref={emblaRef}
          style={{
            maskImage:
              'linear-gradient(to right, transparent 0%, black 64px, black calc(100% - 64px), transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, black 64px, black calc(100% - 64px), transparent 100%)',
          }}
        >
          <div className="flex gap-4 md:gap-6">
            <div className="min-w-0 flex-[0_0_100%] space-y-3 md:flex-[0_0_calc(50%-12px)] lg:flex-[0_0_calc(33.333%-16px)]">
              {column1.map((title) => (
                <MediaCompactCard
                  key={title}
                  title={title}
                  channelName="Channel"
                  duration="23:23"
                  timestamp="Yesterday"
                />
              ))}
            </div>
            <div className="min-w-0 flex-[0_0_100%] space-y-3 md:flex-[0_0_calc(50%-12px)] lg:flex-[0_0_calc(33.333%-16px)]">
              {column2.map((title) => (
                <MediaCompactCard
                  key={title}
                  title={title}
                  channelName="Channel"
                  duration="23:23"
                  timestamp="Yesterday"
                />
              ))}
            </div>
            <div className="min-w-0 flex-[0_0_100%] space-y-3 md:flex-[0_0_calc(50%-12px)] lg:flex-[0_0_calc(33.333%-16px)]">
              {column3.map((title) => (
                <MediaCompactCard
                  key={title}
                  title={title}
                  channelName="Channel"
                  duration="23:23"
                  timestamp="Yesterday"
                />
              ))}
            </div>
          </div>
        </div>

        <div className="lg:hidden">
          <CarouselNavigationButtons
            canScrollPrev={canScrollPrev}
            canScrollNext={canScrollNext}
            onScrollPrev={scrollPrev}
            onScrollNext={scrollNext}
          />
        </div>
      </div>
    </div>
  );
}

function TrendingSearches() {
  const searches = [
    'Bible Study',
    'Christian Theology',
    'Worship',
    'Jesus',
    'Prayer Life',
    'Scripture',
    'Faith',
    'Ministry',
    'Sanctification',
    'Grace',
    'Salvation',
    'Trinity',
    'Holy Spirit',
    'Church',
    'Gospel',
    'Hope',
  ];

  return (
    <div className="mb-8">
      <h2 className="mb-6 font-medium text-lg text-primary">
        Trending Searches
      </h2>
      <div className="flex flex-wrap gap-2">
        {searches.map((search) => (
          <TrendingSearchPill key={search} search={search} />
        ))}
      </div>
    </div>
  );
}

function Home() {
  const isLoggedIn = useIsLoggedIn();
  const trpc = useTRPC();

  const { data: trendingUploads } = useSuspenseQuery(
    trpc.home.getTrendingUploads.queryOptions({ limit: 20 }),
  );

  const { data: subscriptionUploads } = useQuery({
    ...trpc.home.getSubscriptionUploads.queryOptions({ limit: 5 }),
    enabled: isLoggedIn,
  });

  const inProgress: ComponentProps<typeof ContentSection>['uploads'] = [];

  return (
    <div className="min-h-screen bg-page">
      <Header>
        <HeroCarousel />
      </Header>

      <div className="mx-auto max-w-7xl space-y-12 px-16 py-8">
        {inProgress.length > 0 ? (
          <ContentSection title="In Progress" uploads={inProgress} />
        ) : null}

        <ContentSection
          title="Following"
          uploads={subscriptionUploads || []}
          showViewMoreCard={
            !!(subscriptionUploads && subscriptionUploads.length > 0)
          }
          viewMoreCardText="See more subscribed content"
          emptyTitle="You're not following any channels yet"
          emptyBody="Follow your favorite channels to get a customized feed and to ensure you don't miss new content!"
          loggedOutEmptyTitle="Create an account to follow channels"
          loggedOutEmptyBody="Follow your favorite channels to get a customized feed and to ensure you don't miss new content!"
          loggedOutEmptyCta="Create Account"
          isLoggedIn={isLoggedIn}
        />

        <MediaGrid>
          {trendingUploads.slice(0, 6).map((upload, _i) => (
            <MediaCard
              key={upload.id}
              mediaId={upload.id}
              title={upload?.title ?? 'Untitled'}
              thumbnailUrl={upload?.thumbnailUrl}
              channelName={upload?.channel.name}
              channelAvatarUrl={upload?.channel.avatarUrl}
            />
          ))}
        </MediaGrid>

        <RecentlySaved />

        <MediaGrid>
          {trendingUploads.slice(6, 11).map((upload, _i) => (
            <MediaCard
              key={upload.id}
              mediaId={upload.id}
              title={upload?.title ?? 'Untitled'}
              thumbnailUrl={upload?.thumbnailUrl}
              channelName={upload?.channel.name}
              channelAvatarUrl={upload?.channel.avatarUrl}
            />
          ))}

          <DonateCard />
        </MediaGrid>

        <MediaGrid>
          {trendingUploads.slice(11, 19).map((upload, _i) => (
            <MediaCard
              key={upload.id}
              mediaId={upload.id}
              title={upload?.title ?? 'Untitled'}
              thumbnailUrl={upload?.thumbnailUrl}
              channelName={upload?.channel.name}
              channelAvatarUrl={upload?.channel.avatarUrl}
            />
          ))}

          <SearchCard />
        </MediaGrid>

        <TrendingSearches />

        <MediaGrid>
          {trendingUploads.slice(19).map((upload, _i) => (
            <MediaCard
              key={upload.id}
              mediaId={upload.id}
              title={upload?.title || 'Untitled'}
              thumbnailUrl={upload?.thumbnailUrl}
              channelName={upload?.channel.name}
              channelAvatarUrl={upload?.channel.avatarUrl}
            />
          ))}
        </MediaGrid>
      </div>
    </div>
  );
}
