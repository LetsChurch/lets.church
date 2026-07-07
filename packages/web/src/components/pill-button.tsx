import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/util/cn';

const pillButtonVariants = cva(
  'flex items-center justify-center rounded-full border-fancy-pants font-semibold transition-opacity hover:opacity-90 disabled:opacity-50',
  {
    variants: {
      variant: {
        brand: 'bg-brand text-white',
        ghost:
          'bg-white/15 text-primary/80 backdrop-blur-sm transition-colors hover:bg-white/20 hover:opacity-100',
      },
      size: {
        sm: 'h-7 px-2.5 py-1.5 text-xs',
        md: 'h-8 px-3 text-sm',
        lg: 'h-9 px-4 text-sm',
      },
    },
    defaultVariants: {
      variant: 'brand',
      size: 'md',
    },
  },
);

export type PillButtonVariants = VariantProps<typeof pillButtonVariants>;

type PillButtonProps = ComponentPropsWithoutRef<'button'> &
  PillButtonVariants & {
    children: ReactNode;
  };

export function getPillButtonClasses({
  variant,
  size,
  className,
}: PillButtonVariants & { className?: string } = {}) {
  return cn(pillButtonVariants({ variant, size }), className);
}

export function PillButton({
  variant,
  size,
  className,
  children,
  ...props
}: PillButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(pillButtonVariants({ variant, size }), className)}
    >
      {children}
    </button>
  );
}
