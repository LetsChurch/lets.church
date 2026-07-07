import { cn } from '@/util/cn';

import { type LcColor, normalizeColor } from './_colors';

type ProgressSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<ProgressSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
  xl: 'h-4',
};

// Filled-bar background per color.
const FILL: Record<LcColor, string> = {
  brand: 'bg-brand',
  gray: 'bg-gray-500',
  red: 'bg-red-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  purple: 'bg-purple-500',
  teal: 'bg-teal-500',
};

type ProgressProps = {
  // 0–100.
  value: number;
  color?: string;
  size?: ProgressSize;
  radius?: 'sm' | 'md' | 'lg' | 'full';
  // Diagonal stripes; `animated` moves them (Mantine's barber-pole).
  striped?: boolean;
  animated?: boolean;
  className?: string;
};

const RADIUS: Record<string, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

export function Progress({
  value,
  color,
  size = 'md',
  radius = 'full',
  striped,
  animated,
  className,
}: ProgressProps) {
  const resolved: LcColor = normalizeColor(color);
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        'w-full overflow-hidden bg-gray-200 dark:bg-zinc-800',
        SIZE[size],
        RADIUS[radius],
        className,
      )}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          'h-full transition-[width] duration-300 ease-out',
          RADIUS[radius],
          FILL[resolved],
          (striped || animated) && 'progress-stripes',
          animated && 'progress-animated',
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
