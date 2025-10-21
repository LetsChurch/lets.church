import { Avatar } from '@base-ui-components/react/avatar';
import { Link } from '@tanstack/react-router';
import useEmblaCarousel from 'embla-carousel-react';
import WheelGestures from 'embla-carousel-wheel-gestures';

type AvatarCarouselProps = {
  items: Array<{
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
    <div className="overflow-hidden" ref={emblaRef}>
      <div className="flex gap-4">
        {items.map((item) => (
          <Link
            key={item.id}
            to="/channel/$slug"
            params={{ slug: item.slug }}
            className="flex w-[72px] flex-shrink-0 flex-col items-center gap-1.5"
          >
            <Avatar.Root className="size-[72px] overflow-hidden rounded-full border-top-highlight">
              <Avatar.Image
                src={item.avatarUrl || undefined}
                alt={item.name}
                className="size-full object-cover"
              />
              <Avatar.Fallback className="flex size-full items-center justify-center rounded-full bg-indigo-500 font-bold text-primary text-xl">
                {item.name.charAt(0).toUpperCase()}
              </Avatar.Fallback>
            </Avatar.Root>
            <p className="line-clamp-2 w-[72px] overflow-hidden text-ellipsis text-center font-normal text-primary text-xs opacity-60">
              {item.name}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
