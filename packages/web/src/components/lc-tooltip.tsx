import { Tooltip } from '@base-ui-components/react/tooltip';
import type { ComponentProps, ReactNode } from 'react';

type LcTooltipProps = {
  children: ReactNode;
  content: ReactNode;
  side?: ComponentProps<typeof Tooltip.Positioner>['side'];
  sideOffset?: number;
  render?: ComponentProps<typeof Tooltip.Trigger>['render'];
};

export function LcTooltip({
  children,
  content,
  side = 'top',
  sideOffset = 8,
  render,
}: LcTooltipProps) {
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger render={render}>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner
            side={side}
            sideOffset={sideOffset}
            className="z-50"
          >
            <Tooltip.Popup className="rounded-lg border-fancy-pants bg-white px-2 py-1.5 font-semibold text-xs shadow-lg dark:bg-zinc-900 dark:text-primary">
              {content}
              <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
