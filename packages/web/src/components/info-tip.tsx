import { IconInfoCircle } from '@tabler/icons-react';
import type { ComponentProps, ReactNode } from 'react';
import { LcTooltip } from '@/components/lc-tooltip';
import { cn } from '@/util/cn';

type InfoTipProps = {
  // The explanatory content revealed on hover/focus.
  content: ReactNode;
  // Accessible label for the trigger (the content is visual-only).
  label: string;
  side?: ComponentProps<typeof LcTooltip>['side'];
  // Glyph size in px; the button sizes itself around it.
  size?: number;
  // Merged onto the trigger button — pass a text color to match the surface
  // (e.g. `text-white` on a dark/hero background).
  className?: string;
};

// A small (i) affordance that reveals an explanatory tooltip on hover/focus.
// Reusable wherever a control needs a bit of inline guidance.
export function InfoTip({
  content,
  label,
  side = 'bottom',
  size = 14,
  className,
}: InfoTipProps) {
  return (
    <LcTooltip.Provider>
      <LcTooltip
        content={content}
        delay={0}
        side={side}
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full text-primary opacity-50 transition-colors hover:bg-white/10 hover:opacity-100',
              className,
            )}
          />
        }
      >
        <IconInfoCircle size={size} />
      </LcTooltip>
    </LcTooltip.Provider>
  );
}
