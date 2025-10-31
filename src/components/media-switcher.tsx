import { Toggle } from '@base-ui-components/react/toggle';
import { ToggleGroup } from '@base-ui-components/react/toggle-group';
import { IconHeadphones, IconVideo } from '@tabler/icons-react';
import { cn } from '@/util/cn';

export type MediaType = 'video' | 'audio';

type MediaSwitcherProps = {
  value?: MediaType;
  onValueChange?: (value: MediaType | null) => void;
  className?: string;
};

export function MediaSwitcher({
  value,
  onValueChange,
  className,
}: MediaSwitcherProps) {
  return (
    <ToggleGroup
      value={value ? [value] : []}
      onValueChange={(newValue) => {
        onValueChange?.(newValue[0] as MediaType | null);
      }}
      className={cn(
        'flex h-8 items-center gap-1 rounded-lg bg-white/10 p-1 backdrop-blur-lg',
        className,
      )}
    >
      <Toggle
        value="video"
        className={cn(
          'flex size-6 items-center justify-center rounded-lg p-1',
          'transition-all duration-200',
          'hover:bg-white/15',
          'data-[pressed]:bg-white/10',
          'data-[pressed]:border-top-highlight',
        )}
        aria-label="Video"
      >
        <IconVideo className="size-4 text-primary" stroke={1.5} />
      </Toggle>
      <Toggle
        value="audio"
        className={cn(
          'flex size-6 items-center justify-center rounded-lg p-1',
          'transition-all duration-200',
          'hover:bg-white/15',
          'data-[pressed]:bg-white/10',
          'data-[pressed]:border-top-highlight',
        )}
        aria-label="Audio"
      >
        <IconHeadphones className="size-4 text-primary" stroke={1.5} />
      </Toggle>
    </ToggleGroup>
  );
}
