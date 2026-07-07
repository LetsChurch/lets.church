import type { ComponentProps, ReactElement, ReactNode } from 'react';

import { LcTooltip } from '@/components/lc-tooltip';

type Side = ComponentProps<typeof LcTooltip>['side'];

// Mantine-compatible tooltip: `<Tooltip label={...}>{trigger}</Tooltip>`. The
// child element becomes the trigger (composed via Base UI's `render`, so we
// never nest a button inside a button — important when wrapping ActionIcon).
type TooltipProps = {
  label: ReactNode;
  children: ReactElement;
  position?:
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'top-start'
    | 'top-end'
    | 'bottom-start'
    | 'bottom-end';
  withArrow?: boolean;
  disabled?: boolean;
};

function toSide(position?: TooltipProps['position']): Side {
  if (!position) return 'top';
  return position.split('-')[0] as Side;
}

export function Tooltip({ label, children, position, disabled }: TooltipProps) {
  if (disabled || label === undefined || label === null || label === '') {
    return children;
  }
  return (
    <LcTooltip.Provider delay={200}>
      <LcTooltip content={label} side={toSide(position)} render={children} />
    </LcTooltip.Provider>
  );
}
