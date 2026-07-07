import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

import { cn } from '@/util/cn';

type PaginationProps = {
  // Total number of pages (matches Mantine's `total`).
  total: number;
  value: number;
  onChange: (page: number) => void;
  size?: 'sm' | 'md' | 'lg';
  siblings?: number;
  boundaries?: number;
  className?: string;
};

const DOTS = 'dots';

function range(start: number, end: number): number[] {
  const length = end - start + 1;
  return Array.from({ length }, (_, i) => start + i);
}

// Build the windowed page list with ellipses, mirroring Mantine's algorithm.
function paginationRange(
  total: number,
  page: number,
  siblings: number,
  boundaries: number,
): Array<number | typeof DOTS> {
  const totalPageNumbers = siblings * 2 + 3 + boundaries * 2;
  if (totalPageNumbers >= total) {
    return range(1, total);
  }

  const leftSiblingIndex = Math.max(page - siblings, boundaries + 1);
  const rightSiblingIndex = Math.min(page + siblings, total - boundaries);

  const shouldShowLeftDots = leftSiblingIndex > boundaries + 2;
  const shouldShowRightDots = rightSiblingIndex < total - (boundaries + 1);

  if (!shouldShowLeftDots && shouldShowRightDots) {
    const leftItemCount = siblings * 2 + boundaries + 2;
    return [
      ...range(1, leftItemCount),
      DOTS,
      ...range(total - (boundaries - 1), total),
    ];
  }

  if (shouldShowLeftDots && !shouldShowRightDots) {
    const rightItemCount = boundaries + 1 + 2 * siblings;
    return [
      ...range(1, boundaries),
      DOTS,
      ...range(total - rightItemCount + 1, total),
    ];
  }

  return [
    ...range(1, boundaries),
    DOTS,
    ...range(leftSiblingIndex, rightSiblingIndex),
    DOTS,
    ...range(total - boundaries + 1, total),
  ];
}

const SIZE: Record<string, string> = {
  sm: 'size-7 text-xs',
  md: 'size-8 text-sm',
  lg: 'size-9 text-sm',
};

export function Pagination({
  total,
  value,
  onChange,
  size = 'md',
  siblings = 1,
  boundaries = 1,
  className,
}: PaginationProps) {
  if (total <= 1) return null;
  const items = paginationRange(total, value, siblings, boundaries);
  const sizeClass = SIZE[size];

  return (
    <nav
      className={cn('flex items-center gap-1', className)}
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label="Previous page"
        className={cn(
          'flex items-center justify-center rounded-md border border-gray-200 text-secondary transition-colors hover:bg-gray-950/5 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-white/5',
          sizeClass,
        )}
      >
        <IconChevronLeft size={16} />
      </button>
      {items.map((item, index) =>
        item === DOTS ? (
          <span
            key={`dots-${index}`}
            className={cn(
              'flex items-center justify-center text-secondary',
              sizeClass,
            )}
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            aria-current={item === value ? 'page' : undefined}
            className={cn(
              'flex items-center justify-center rounded-md border font-medium transition-colors',
              sizeClass,
              item === value
                ? 'border-brand bg-brand text-white'
                : 'border-gray-200 text-primary hover:bg-gray-950/5 dark:border-zinc-700 dark:hover:bg-white/5',
            )}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(Math.min(total, value + 1))}
        disabled={value >= total}
        aria-label="Next page"
        className={cn(
          'flex items-center justify-center rounded-md border border-gray-200 text-secondary transition-colors hover:bg-gray-950/5 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-white/5',
          sizeClass,
        )}
      >
        <IconChevronRight size={16} />
      </button>
    </nav>
  );
}
