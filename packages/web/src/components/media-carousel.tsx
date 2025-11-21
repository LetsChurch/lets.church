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
  fadeMargin = 'sm:-mx-16 sm:px-16',
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
        '(min-width: 1024px)': { slidesToScroll: 4 },
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
      <div className="relative isolate">
        <div
          className={cn(
            'sm:fade-horizontal relative overflow-visible',
            fadeMargin,
          )}
          ref={emblaRef}
          style={{
            '--fade-size': `${fadeSize}px`,
          }}
        >
          <div className="flex gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="min-w-0 flex-[0_0_75%] md:flex-[0_0_calc(50%-4px)] lg:flex-[0_0_calc(26%-12px)]"
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
                  size="small"
                />
              </div>
            ))}
            {viewMoreCard ? (
              <div className="min-w-0 flex-[0_0_75%] md:flex-[0_0_calc(50%-4px)] lg:flex-[0_0_calc(26%-12px)]">
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
