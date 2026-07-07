import { IconPlayerPlayFilled, IconX } from '@tabler/icons-react';

import LcButton from '@/components/lc-button';

type AutoplayCountdownProps = {
  isVisible: boolean;
  countdown: number;
  nextMediaTitle: string;
  onCancel: () => void;
};

export function AutoplayCountdown({
  isVisible,
  countdown,
  nextMediaTitle,
  onCancel,
}: AutoplayCountdownProps) {
  if (!isVisible) return null;

  const progress = (countdown / 5) * 100;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center pb-24">
      <div className="border-fancy-pants pointer-events-auto flex max-w-md items-center gap-4 rounded-2xl bg-zinc-900/90 px-6 py-4 backdrop-blur-lg">
        {/* Circular Progress */}
        <div className="relative flex size-12 shrink-0 items-center justify-center">
          <svg
            className="size-full -rotate-90"
            viewBox="0 0 48 48"
            role="img"
            aria-label="Countdown progress"
          >
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-zinc-700"
            />
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 20}`}
              strokeDashoffset={`${2 * Math.PI * 20 * (1 - progress / 100)}`}
              strokeLinecap="round"
              className="text-brand transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <IconPlayerPlayFilled size={16} className="text-brand" />
          </div>
        </div>

        {/* Text */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-sm text-zinc-400">Next up in {countdown}s</p>
          <p className="text-primary truncate text-sm font-medium">
            {nextMediaTitle}
          </p>
        </div>

        {/* Cancel Button */}
        <LcButton
          onClick={onCancel}
          className="flex shrink-0 items-center gap-1.5"
          aria-label="Cancel autoplay"
        >
          <IconX size={16} />
          <span>Cancel</span>
        </LcButton>
      </div>
    </div>
  );
}
