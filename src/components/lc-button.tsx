import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/util/cn';

type LcButtonProps = ComponentPropsWithoutRef<'button'>;

export default function LcButton({
  className,
  children,
  ...props
}: LcButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'rounded-full border-top-highlight bg-white/15 px-3 py-1.5 font-semibold text-primary/80 text-sm',
        className,
      )}
    >
      {children}
    </button>
  );
}
