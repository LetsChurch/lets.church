import { Link } from '@tanstack/react-router';
import useEmblaCarousel from 'embla-carousel-react';
import WheelGestures from 'embla-carousel-wheel-gestures';

import { Avatar } from '@/components/avatar';

type AvatarCarouselProps = {
  items: ReadonlyArray<{
    id: string;
    name: string;
    slug: string;
    avatarUrl?: string | null;
  }>;
};

export function AvatarCarousel({ items }: AvatarCarouselProps) {
  const [emblaRef] = useEmblaCarousel(
    {
      align: 'start',
      dragFree: true,
    },
    [WheelGestures()],
  );

  return (
    <div className="overflow-hidden sm:-mx-16 sm:px-16" ref={emblaRef}>
      <div className="flex gap-4 px-4 sm:px-0">
        {items.map((item) => (
          <Link
            key={item.id}
            to="/channel/$slug"
            params={{ slug: item.slug }}
            className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
          >
            <Avatar
              src={item.avatarUrl || undefined}
              alt={item.name}
              className="border-fancy-pants size-[72px]"
              fallbackClassName="bg-brand font-bold text-xl"
            />
            <p className="text-primary line-clamp-2 w-[72px] overflow-hidden text-center text-xs font-normal text-ellipsis opacity-60">
              {item.name}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
