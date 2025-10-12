import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { cn } from '@/util/cn';

type CarouselNavigationButtonsProps = {
  canScrollPrev: boolean;
  canScrollNext: boolean;
  onScrollPrev: () => void;
  onScrollNext: () => void;
  positioning?: 'inside' | 'outside';
};

export function CarouselNavigationButtons({
  canScrollPrev,
  canScrollNext,
  onScrollPrev,
  onScrollNext,
  positioning = 'outside',
}: CarouselNavigationButtonsProps) {
  const leftClass = positioning === 'inside' ? 'left-4' : '-left-6';
  const rightClass = positioning === 'inside' ? 'right-4' : '-right-6';

  return (
    <>
      {canScrollPrev && (
        <button
          type="button"
          onClick={onScrollPrev}
          className={cn(
            '-translate-y-1/2 absolute top-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full border-top-highlight bg-white/10 backdrop-blur-sm transition-all hover:bg-white/20',
            leftClass,
          )}
        >
          <IconChevronLeft size={20} className="text-primary" />
        </button>
      )}

      {canScrollNext && (
        <button
          type="button"
          onClick={onScrollNext}
          className={cn(
            '-translate-y-1/2 absolute top-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full border-top-highlight bg-white/10 backdrop-blur-sm transition-all hover:bg-white/20',
            rightClass,
          )}
        >
          <IconChevronRight size={20} className="text-primary" />
        </button>
      )}
    </>
  );
}
