import type { EmblaCarouselType } from 'embla-carousel';
import Autoplay from 'embla-carousel-autoplay';
import useEmblaCarousel from 'embla-carousel-react';
import { useCallback, useEffect, useState } from 'react';
import { $headerBackgroundImage } from '@/stores/header';
import { CarouselNavigationButtons } from './carousel-navigation-buttons';
import { CarouselPagination } from './carousel-pagination';

type CarouselItemProps = {
  title: string;
  author: string;
  imageUrl: string;
  badge?: string;
};

function CarouselItem({
  title,
  author,
  imageUrl,
  badge = 'Featured',
}: CarouselItemProps) {
  return (
    <div className="w-90 flex-shrink-0 md:w-124 lg:w-160">
      <div className="space-y-5">
        {/* Image Container */}
        <div className="relative aspect-video overflow-hidden rounded-2xl border-top-highlight bg-card">
          <div
            className="absolute inset-0 bg-center bg-cover"
            style={{
              backgroundImage: `url('${imageUrl}')`,
            }}
          />
          {/* Badge */}
          <div className="absolute top-2 left-2">
            <div className="flex items-center rounded-full bg-zinc-950/80 px-2 backdrop-blur-sm">
              <span className="font-medium text-primary text-xs">{badge}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2 text-center">
          <h3 className="line-clamp-1 font-bold text-lg text-primary">
            {title}
          </h3>
          <div className="flex items-center justify-center gap-1.5">
            <div className="h-4 w-4 flex-shrink-0 rounded-full bg-indigo-500" />
            <span className="text-secondary text-sm">{author}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export const carouselItems = [
  {
    title: 'First Item',
    author: 'First Channel',
    imageUrl:
      'https://unsplash.com/photos/vAij-E26haI/download?ixid=M3wxMjA3fDB8MXxhbGx8fHx8fHx8fHwxNzU4MjUyODYwfA&force=true&w=1920',
  },
  {
    title: 'Second Item',
    author: 'Second Channel',
    imageUrl:
      'https://unsplash.com/photos/_86u_Y0oAaM/download?ixid=M3wxMjA3fDB8MXxhbGx8fHx8fHx8fHwxNzU4MjM0MTAyfA&force=true&w=1920',
  },
  {
    title: 'Third Item',
    author: 'Third Channel',
    imageUrl:
      'https://unsplash.com/photos/DRgrzQQsJDA/download?ixid=M3wxMjA3fDB8MXxhbGx8fHx8fHx8fHwxNzU4MjM3NDIxfA&force=true&w=1920',
  },
  {
    title: 'Fourth Item',
    author: 'Fourth Channel',
    imageUrl:
      'https://unsplash.com/photos/k1bO_VTiZSs/download?ixid=M3wxMjA3fDB8MXxhbGx8fHx8fHx8fHwxNzU4MjQzNzU4fA&force=true&w=1920',
  },
  {
    title: 'Fifth Item',
    author: 'Fifth Channel',
    imageUrl:
      'https://unsplash.com/photos/yFKkFPvUgXc/download?ixid=M3wxMjA3fDB8MXxhbGx8fHx8fHx8fHwxNzU4MjM3NDExfA&force=true&w=1920',
  },
];

export default function HeroCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'center',
      containScroll: false,
      slidesToScroll: 1,
    },
    [Autoplay({ delay: 4000, stopOnInteraction: false })],
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
    carouselItems.forEach((item) => {
      const img = new Image();
      img.src = item.imageUrl;
    });

    // Set initial background image
    $headerBackgroundImage.set(carouselItems[0].imageUrl);

    return () => $headerBackgroundImage.set(undefined);
  }, []);

  useEffect(() => {
    if (!emblaApi) return;

    function onInit(emblaApi: EmblaCarouselType) {
      setScrollSnaps(emblaApi.scrollSnapList());
    }

    function onSelect(emblaApi: EmblaCarouselType) {
      const newIndex = emblaApi.selectedScrollSnap();
      setSelectedIndex(newIndex);
      $headerBackgroundImage.set(carouselItems[newIndex].imageUrl);
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
        const actualIndex = index % carouselItems.length;
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
  }, [emblaApi, selectedIndex]);

  return (
    <div className="relative z-10 pb-6">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-5 px-5 pb-6">
          {carouselItems.map((item, index) => (
            <div
              key={item.imageUrl}
              className={`flex min-w-0 flex-[0_0_360px] justify-center transition-opacity duration-500 ease-in-out md:flex-[0_0_495px] lg:flex-[0_0_640px] ${
                index === 0 ? 'opacity-100' : 'opacity-20'
              }`}
            >
              <CarouselItem {...item} />
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
