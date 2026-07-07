import { Tooltip } from '@base-ui/react/tooltip';
import { type ComponentPropsWithoutRef, Fragment } from 'react';

import { cn } from '@/util/cn';

type LcButtonGroupProps = {
  className?: string;
  buttons: Array<ComponentPropsWithoutRef<'button'> & { tooltip?: string }>;
};

export default function LcButtonGroup({
  className,
  buttons,
}: LcButtonGroupProps) {
  return (
    <Tooltip.Provider>
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
                i > 0 &&
                  '-ml-px border-gray-950/5 border-l dark:border-white/10',
                btn.className,
              )}
            />
          );

          return (
            <Fragment key={i}>
              {tooltip ? (
                <Tooltip.Root>
                  <Tooltip.Trigger render={content} />
                  <Tooltip.Portal>
                    <Tooltip.Positioner
                      side="top"
                      sideOffset={8}
                      className="z-50"
                    >
                      <Tooltip.Popup className="border-fancy-pants dark:text-primary rounded-lg bg-white px-2 py-1.5 text-xs font-semibold shadow-lg dark:bg-zinc-900">
                        {tooltip}
                        <Tooltip.Arrow className="data-[side=bottom]:-top-1 data-[side=left]:-right-1 data-[side=right]:-left-1 data-[side=top]:-bottom-1" />
                      </Tooltip.Popup>
                    </Tooltip.Positioner>
                  </Tooltip.Portal>
                </Tooltip.Root>
              ) : (
                content
              )}
            </Fragment>
          );
        })}
      </div>
    </Tooltip.Provider>
  );
}
