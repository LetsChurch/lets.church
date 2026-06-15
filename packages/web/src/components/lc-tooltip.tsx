import { Tooltip } from '@base-ui-components/react/tooltip';
import type { ComponentProps, ReactNode } from 'react';

type LcTooltipProps = {
  // Optional: when `render` is provided, it supplies the trigger element
  // instead of wrapping `children` in the default trigger button.
  children?: ReactNode;
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
            <Tooltip.Arrow className="data-[side=bottom]:-top-1 data-[side=left]:-right-1 data-[side=top]:-bottom-1 data-[side=right]:-left-1" />
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// Attach Provider to LcTooltip for convenient access
LcTooltip.Provider = Tooltip.Provider;
