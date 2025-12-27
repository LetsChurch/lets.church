import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/util/cn';

type PillButtonVariant = 'brand' | 'ghost';
type PillButtonSize = 'sm' | 'md' | 'lg';

type PillButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: PillButtonVariant;
  size?: PillButtonSize;
  children: ReactNode;
};

const sizeClasses: Record<PillButtonSize, string> = {
  sm: 'h-7 px-2.5 py-1.5 text-xs',
  md: 'h-8 px-3 text-sm',
  lg: 'h-9 px-4 text-sm',
};

const variantClasses: Record<PillButtonVariant, string> = {
  brand: 'bg-brand text-white',
  ghost:
    'bg-white/15 text-primary/80 backdrop-blur-sm transition-colors hover:bg-white/20 hover:opacity-100',
};

export function getPillButtonClasses({
  variant = 'brand',
  size = 'md',
  className,
}: {
  variant?: PillButtonVariant;
  size?: PillButtonSize;
  className?: string;
} = {}) {
  return cn(
    'flex items-center justify-center rounded-full border-fancy-pants font-semibold transition-opacity hover:opacity-90 disabled:opacity-50',
    sizeClasses[size],
    variantClasses[variant],
    className,
  );
}

export function PillButton({
  variant = 'brand',
  size = 'md',
  className,
  children,
  ...props
}: PillButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={getPillButtonClasses({ variant, size, className })}
    >
      {children}
    </button>
  );
}
