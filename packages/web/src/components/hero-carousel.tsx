import { Link } from '@tanstack/react-router';
import type { EmblaCarouselType } from 'embla-carousel';
import Autoplay from 'embla-carousel-autoplay';
import useEmblaCarousel from 'embla-carousel-react';
import WheelGestures from 'embla-carousel-wheel-gestures';
import { useCallback, useEffect, useState } from 'react';
import { $headerBackgroundImage } from '@/stores/header';
import { cn } from '@/util/cn';
import { Avatar } from './avatar';
import { CarouselNavigationButtons } from './carousel-navigation-buttons';
import { CarouselPagination } from './carousel-pagination';

type CarouselItemData = {
  id: string;
  title: string | null;
  author: string;
  imageUrl: string | null;
  avatarUrl: string | null;
  badge?: string;
};

type CarouselItemProps = CarouselItemData & {
  isActive?: boolean;
};

function CarouselItem({
  id,
  title,
  author,
  imageUrl,
  avatarUrl,
  badge = 'Featured',
  isActive = false,
}: CarouselItemProps) {
  return (
    <div
      className={cn(
        'relative w-90 shrink-0 md:w-124 lg:w-160',
        isActive && 'group',
      )}
    >
      <div className="space-y-5">
        {/* Image Container */}
        <div className="relative aspect-video overflow-hidden rounded-2xl border-fancy-pants bg-zinc-100 dark:bg-zinc-900">
          {imageUrl ? (
            <div
              className="absolute inset-0 bg-center bg-cover transition-transform duration-300 ease-out-expo will-change-transform group-hover:scale-[1.01]"
              style={{
                backgroundImage: `url('${imageUrl}')`,
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
              <span className="text-secondary text-sm">No thumbnail</span>
            </div>
          )}
          {/* Badge */}
          <div className="absolute top-2 left-2">
            <div className="flex items-center rounded-full bg-gray-950/50 px-2 backdrop-blur-sm dark:bg-white/50">
              <span className="font-medium text-shadow text-white text-xs dark:text-gray-950">
                {badge}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2 text-center">
          <h3 className="line-clamp-1 font-bold text-lg text-primary">
            <Link
              to="/media/$mediaId"
              params={{ mediaId: id }}
              className="after:absolute after:inset-0"
            >
              {title || 'Untitled'}
            </Link>
          </h3>
          <div className="flex items-center justify-center gap-1.5">
            <Avatar
              src={avatarUrl}
              alt={author}
              fallbackText={author.charAt(0).toUpperCase()}
              className="h-4 w-4 shrink-0"
            />
            <span className="text-secondary text-sm">{author}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type HeroCarouselProps = {
  items: CarouselItemData[];
};

export default function HeroCarousel({ items }: HeroCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'center',
      containScroll: false,
      slidesToScroll: 1,
    },
    [Autoplay({ delay: 4000, stopOnInteraction: false }), WheelGestures()],
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
    // Preload all background images
    items.forEach((item) => {
      if (item.imageUrl) {
        const img = new Image();
        img.src = item.imageUrl;
      }
    });
  }, [items]);

  useEffect(() => {
    if (!emblaApi) return;

    function onInit(emblaApi: EmblaCarouselType) {
      setScrollSnaps(emblaApi.scrollSnapList());
    }

    function onSelect(emblaApi: EmblaCarouselType) {
      const newIndex = emblaApi.selectedScrollSnap();
      setSelectedIndex(newIndex);
      $headerBackgroundImage.set(items[newIndex]?.imageUrl || undefined);
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    }

    onInit(emblaApi);
    onSelect(emblaApi);
    emblaApi.on('reInit', onInit);
    emblaApi.on('select', onSelect);

    // Apply fade effect to slides
    const applyFadeEffect = () => {
      const slides = emblaApi.slideNodes();
      const slidesInView = emblaApi.slidesInView();

      slides.forEach((slide: HTMLElement, index: number) => {
        const actualIndex = index % items.length;
        if (slidesInView.includes(index)) {
          slide.style.opacity = actualIndex === selectedIndex ? '1' : '0.2';
        } else {
          slide.style.opacity = '0.2';
        }
      });
    };

    emblaApi.on('scroll', applyFadeEffect);
    emblaApi.on('select', applyFadeEffect);

    setTimeout(applyFadeEffect, 100);

    return () => {
      emblaApi.off('scroll', applyFadeEffect);
      emblaApi.off('select', applyFadeEffect);
    };
  }, [emblaApi, selectedIndex, items]);

  // If no items, don't render the carousel
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="relative isolate pb-6">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-5 px-5 pb-6">
          {items.map((item, index) => (
            <div
              key={item.imageUrl || index}
              className={cn(
                'flex min-w-0 flex-[0_0_360px] justify-center transition-opacity duration-500 ease-in-out md:flex-[0_0_495px] lg:flex-[0_0_640px]',
                index === 0 ? 'opacity-100' : 'opacity-20',
              )}
            >
              <CarouselItem {...item} isActive={index === selectedIndex} />
            </div>
          ))}
        </div>
      </div>

      <CarouselNavigationButtons
        canScrollPrev={canScrollPrev}
        canScrollNext={canScrollNext}
        onScrollPrev={scrollPrev}
        onScrollNext={scrollNext}
        positioning="inside"
      />

      <div className="-mt-2 flex items-center justify-center gap-2">
        {scrollSnaps.map((item, index) => (
          <CarouselPagination
            key={item}
            isActive={index === selectedIndex}
            onClick={() => scrollTo(index)}
          />
        ))}
      </div>
    </div>
  );
}
