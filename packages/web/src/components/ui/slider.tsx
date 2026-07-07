import { Slider as BaseSlider } from '@base-ui/react/slider';

import { cn } from '@/util/cn';

type Mark = { value: number; label?: string };

type SliderProps = {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  marks?: Mark[];
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
};

// Mantine-compatible single-value slider built on Base UI Slider.
export function Slider({
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue,
  onChange,
  onChangeEnd,
  marks,
  disabled,
  className,
}: SliderProps) {
  const toNumber = (v: number | readonly number[]) =>
    Array.isArray(v) ? v[0] : (v as number);

  return (
    <div className={cn('w-full', marks?.length ? 'pb-6' : undefined)}>
      <BaseSlider.Root
        min={min}
        max={max}
        step={step}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onValueChange={(v) => onChange?.(toNumber(v))}
        onValueCommitted={(v) => onChangeEnd?.(toNumber(v))}
        className={className}
      >
        <BaseSlider.Control className="relative flex h-5 w-full items-center">
          <BaseSlider.Track className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-zinc-700">
            <BaseSlider.Indicator className="bg-brand rounded-full" />
            <BaseSlider.Thumb className="border-brand focus-visible:ring-brand/40 size-4 rounded-full border-2 bg-white shadow-sm outline-none focus-visible:ring-2 dark:bg-zinc-900" />
          </BaseSlider.Track>
          {marks?.length ? (
            <div className="pointer-events-none absolute inset-x-0 top-6">
              {marks.map((mark) => {
                const pct = ((mark.value - min) / (max - min)) * 100;
                return (
                  <span
                    key={mark.value}
                    className="text-secondary absolute -translate-x-1/2 text-xs"
                    style={{ left: `${pct}%` }}
                  >
                    {mark.label ?? mark.value}
                  </span>
                );
              })}
            </div>
          ) : null}
        </BaseSlider.Control>
      </BaseSlider.Root>
    </div>
  );
}
