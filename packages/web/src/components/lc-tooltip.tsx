import { Tooltip } from '@base-ui/react/tooltip';
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

// Per-tooltip delay isn't a `Tooltip.Root` prop in Base UI 1.6 — it's set on
// `Tooltip.Provider` (exposed here as `LcTooltip.Provider`). Wrap a group in
// `<LcTooltip.Provider delay={…}>` to control hover timing.
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
          <Tooltip.Popup className="border-fancy-pants dark:text-primary rounded-lg bg-white px-2 py-1.5 text-xs font-semibold shadow-lg dark:bg-zinc-900">
            {content}
            <Tooltip.Arrow className="data-[side=bottom]:-top-1 data-[side=left]:-right-1 data-[side=right]:-left-1 data-[side=top]:-bottom-1" />
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// Attach Provider to LcTooltip for convenient access
LcTooltip.Provider = Tooltip.Provider;
