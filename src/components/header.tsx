import { IconMenu2 } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { EmblaCarouselType } from 'embla-carousel';
import Autoplay from 'embla-carousel-autoplay';
import useEmblaCarousel from 'embla-carousel-react';
import { useCallback, useEffect, useState } from 'react';
import { CarouselNavigationButtons } from './carousel-navigation-buttons';
import { CarouselPagination } from './carousel-pagination';
import Logo from './logo';
import MobileMenu from './mobile-menu';
import Search from './search';

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
    <div className="w-[360px] flex-shrink-0 md:w-[495px] lg:w-[640px]">
      <div className="space-y-5">
        {/* Image Container */}
        <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-top-highlight bg-card">
          <div
            className="absolute inset-0 bg-center bg-cover"
            style={{
              backgroundImage: `url('${imageUrl}')`,
            }}
          />
          {/* Badge */}
          <div className="absolute top-2 left-2">
            <div className="flex items-center rounded-full border border-default bg-zinc-950/80 px-2 backdrop-blur-sm">
              <span className="font-medium text-white text-xs">{badge}</span>
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

export default function Header() {
  const carouselItems = [
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
  }, []);

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

    // Apply fade effect only after a brief delay to let CSS take effect first
    setTimeout(applyFadeEffect, 100);

    return () => {
      emblaApi.off('scroll', applyFadeEffect);
      emblaApi.off('select', applyFadeEffect);
    };
  }, [emblaApi, selectedIndex]);

  return (
    <div className="relative">
      {/* Background with gradient overlay */}
      <div className="-top-16 absolute inset-0 h-[244px]">
        <div className="absolute inset-0 bg-indigo-500 opacity-60">
          <div
            className="mask-[linear-gradient(to_bottom,black_0%,black_70%,transparent_100%)] absolute inset-0 bg-center bg-cover blur-lg brightness-200 transition-all duration-1000 ease-in-out"
            style={{
              backgroundImage: `url('${carouselItems[selectedIndex]?.imageUrl}')`,
            }}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/0 via-zinc-950/90 to-zinc-950" />
      </div>

      {/* Theme gradient */}
      <div className="absolute inset-x-0 top-0 z-5 h-[240px] bg-gradient-to-b from-indigo-500/40 to-transparent" />

      {/* Top Navigation Bar */}
      <div className="relative z-10 flex h-16 items-center justify-between p-4">
        {/* Mobile Logo and Menu Button (visible when sidebar is hidden) */}
        <div className="flex items-center gap-3 sm:hidden">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex size-8 items-center justify-center rounded-lg border-top-highlight bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <IconMenu2 />
          </button>
          <Logo />
        </div>

        {/* Search Bar */}
        <div className="w-80 max-sm:hidden">
          <Search />
        </div>

        {/* Login Button */}
        <div className="flex items-center gap-2">
          <Link
            to="/auth/login"
            className="rounded-full border-top-highlight bg-white/15 px-3 py-1.5 font-semibold text-sm text-white/80"
          >
            Login
          </Link>
        </div>
      </div>

      {/* Carousel Banner */}
      <div className="relative z-10 pb-6">
        <div className="relative">
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
        </div>

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

      <MobileMenu open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen} />
    </div>
  );
}
