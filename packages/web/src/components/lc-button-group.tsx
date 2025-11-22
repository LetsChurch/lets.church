import { type ComponentPropsWithoutRef, Fragment } from 'react';
import { cn } from '@/util/cn';
import { LcTooltip } from './lc-tooltip';

type LcButtonGroupProps = {
  className?: string;
  buttons: Array<ComponentPropsWithoutRef<'button'> & { tooltip?: string }>;
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
      {buttons.map(({ tooltip, ...btn }, i) => {
        const content = (
          <button
            {...btn}
            className={cn(
              'inline-flex items-center gap-0.5 px-3 py-1.5 pt-1.25',
              i > 0 && '-ml-px border-gray-950/5 border-l dark:border-white/10',
              btn.className,
            )}
          />
        );

        return (
          <Fragment
            // biome-ignore lint/suspicious/noArrayIndexKey: Fixed groups
            key={i}
          >
            {tooltip ? (
              <LcTooltip content={tooltip}>{content}</LcTooltip>
            ) : (
              content
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
