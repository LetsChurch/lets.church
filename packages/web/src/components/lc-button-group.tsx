import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/util/cn';

type LcButtonGroupProps = {
  className?: string;
  buttons: Array<ComponentPropsWithoutRef<'button'>>;
};

export default function LcButtonGroup({
  className,
  buttons,
}: LcButtonGroupProps) {
  return (
    <div
      className={cn(
        'isolate inline-flex overflow-clip rounded-full border-fancy-pants bg-gray-950/10 pt-px font-semibold text-primary/80 text-sm dark:bg-white/15',
        className,
      )}
    >
      {buttons.map((btn, i) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: Fixed groups
          key={i}
          {...btn}
          className={cn(
            'inline-flex items-center gap-0.5 px-3 py-1.5 pt-1.25',
            i > 0 && '-ml-px border-gray-950/5 border-l-1 dark:border-white/10',
            btn.className,
          )}
        />
      ))}
    </div>
  );
}
