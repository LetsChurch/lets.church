import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '@/util/cn';

const tagVariants = cva(
  'inline-flex items-center rounded-full border-fancy-pants font-semibold text-primary/80 uppercase tracking-wide',
  {
    variants: {
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-3 py-1 text-xs',
      },
      color: {
        BLUE: 'bg-blue-500/10',
        GREEN: 'bg-green-500/10',
        RED: 'bg-red-500/10',
        INDIGO: 'bg-indigo-500/10',
        PINK: 'bg-pink-500/10',
        PURPLE: 'bg-purple-500/10',
        GRAY: 'bg-gray-500/10',
      },
    },
    defaultVariants: {
      size: 'md',
      color: 'GRAY',
    },
  },
);

export type TagProps = VariantProps<typeof tagVariants> & {
  children: ReactNode;
  className?: string;
};

export function Tag({ children, size, color, className }: TagProps) {
  return (
    <span className={cn(tagVariants({ size, color }), className)}>
      {children}
    </span>
  );
}
