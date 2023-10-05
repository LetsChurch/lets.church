import { createSignal, onCleanup, onMount, For } from 'solid-js';
import invariant from 'tiny-invariant';
import { chunk, cn } from '~/util';

const TARGET_BAR_WIDTH = 5;

export type Props = {
  peaks: number[];
  currentTime: number;
  lengthSeconds: number;
  onSeek: (time: number) => unknown;
  class?: string;
};

export default function Waveform(props: Props) {
  const [barCount, setBarCount] = createSignal(100);
  const reducedPeaks = () =>
    chunk(props.peaks, Math.floor(props.peaks.length / barCount())).map(
      (chunk) => Math.max(...chunk),
    );
  let container: HTMLDivElement | null;
  let rob: ResizeObserver | null = null;

  onMount(() => {
    invariant(container, 'Container ref is undefined');

    rob = new ResizeObserver((entries) => {
      const entry = entries.at(0);
      invariant(entry, 'Resize observer entry is undefined');
      setBarCount(Math.floor(entry.contentRect.width / TARGET_BAR_WIDTH));
    });

    rob.observe(container);
  });

  onCleanup(() => {
    rob?.disconnect();
  });

  const percentage = () =>
    props.lengthSeconds ? (props.currentTime / props.lengthSeconds) * 100 : 1;

  return (
    <div
      role="progressbar"
      class={cn('relative h-16 cursor-pointer', props.class)}
      ref={(el) => void (container = el)}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        props.onSeek(percentage * props.lengthSeconds);
      }}
    >
      <For each={[0, 1]}>
        {(i) => (
          <div
            class="absolute inset-0 flex flex-row items-center justify-between gap-px"
            role="presentation"
            style={{
              'clip-path': i === 0 ? 'none' : `inset(0 0 0 ${percentage()}%)`,
            }}
            aria-valuemin={0}
            aria-valuemax={props.lengthSeconds}
            aria-valuenow={props.currentTime}
          >
            <For each={reducedPeaks()}>
              {(peak) => (
                <div
                  style={{ height: `${((peak + 128) / (127 + 128)) * 100}%` }}
                  class={cn(
                    'flex-1 rounded-sm',
                    i === 0 ? 'bg-indigo-500' : 'bg-indigo-200',
                  )}
                />
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}
