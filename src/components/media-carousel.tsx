import type { EmblaCarouselType } from 'embla-carousel';
import useEmblaCarousel from 'embla-carousel-react';
import WheelGestures from 'embla-carousel-wheel-gestures';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { CarouselNavigationButtons } from '@/components/carousel-navigation-buttons';
import { CarouselPagination } from '@/components/carousel-pagination';
import { MediaCard } from '@/components/media-card';
import { cn } from '@/util/cn';

type MediaCarouselProps = {
  items: Array<{
    id: string;
    title?: string | null;
    thumbnailUrl?: string | null;
    channelName?: string;
    channelAvatarUrl?: string | null;
    duration?: string;
    timestamp?: string;
    progress?: number;
  }>;
  showPagination?: boolean;
  tailerCard?: ReactNode;
  fadeMargin?: string;
  fadeSize?: number;
  buttonPositioning?: 'inside' | 'outside';
};

export function MediaCarousel({
  items,
  showPagination = false,
  tailerCard: viewMoreCard,
  fadeMargin = '-mx-16 px-16',
  fadeSize = 64,
  buttonPositioning = 'outside',
}: MediaCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: false,
      align: 'start',
      containScroll: 'trimSnaps',
      slidesToScroll: 1,
      breakpoints: {
        '(min-width: 768px)': { slidesToScroll: 2 },
        '(min-width: 1024px)': { slidesToScroll: 3 },
      },
    },
    [WheelGestures()],
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);

  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    function onInit(emblaApi: EmblaCarouselType) {
      setScrollSnaps(emblaApi.scrollSnapList());
    }

    function onSelect(emblaApi: EmblaCarouselType) {
      setSelectedIndex(emblaApi.selectedScrollSnap());
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    }

    onInit(emblaApi);
    onSelect(emblaApi);
    emblaApi.on('reInit', onInit);
    emblaApi.on('select', onSelect);

    return () => {
      emblaApi.off('reInit', onInit);
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  return (
    <>
      <div className="relative">
        <div
          className={cn('relative overflow-visible', fadeMargin)}
          ref={emblaRef}
          style={{
            maskImage: `linear-gradient(to right, transparent 0%, black ${fadeSize}px, black calc(100% - ${fadeSize}px), transparent 100%)`,
            WebkitMaskImage: `linear-gradient(to right, transparent 0%, black ${fadeSize}px, black calc(100% - ${fadeSize}px), transparent 100%)`,
          }}
        >
          <div className="flex gap-6">
            {items.map((item) => (
              <div
                key={item.id}
                className="min-w-0 flex-[0_0_100%] md:flex-[0_0_calc(50%-12px)] lg:flex-[0_0_calc(33.333%-16px)]"
              >
                <MediaCard
                  mediaId={item.id}
                  title={item.title}
                  thumbnailUrl={item.thumbnailUrl}
                  channelName={item.channelName}
                  channelAvatarUrl={item.channelAvatarUrl}
                  duration={item.duration}
                  timestamp={item.timestamp}
                  progress={item.progress}
                />
              </div>
            ))}
            {viewMoreCard ? (
              <div className="min-w-0 flex-[0_0_100%] md:flex-[0_0_calc(50%-12px)] lg:flex-[0_0_calc(33.333%-16px)]">
                {viewMoreCard}
              </div>
            ) : null}
          </div>
        </div>

        <CarouselNavigationButtons
          canScrollPrev={canScrollPrev}
          canScrollNext={canScrollNext}
          onScrollPrev={scrollPrev}
          onScrollNext={scrollNext}
          positioning={buttonPositioning}
        />
      </div>

      {showPagination && scrollSnaps.length > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-2">
          {scrollSnaps.map((snap, index) => (
            <CarouselPagination
              key={snap}
              isActive={index === selectedIndex}
              onClick={() => scrollTo(index)}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
