import { createEffect, createMemo, For } from 'solid-js';
import bSearch from 'binary-search';
import { formatTime } from '~/util';

export type Props = {
  transcript: Array<{ start: number; text: string }>;
  currentTime: number;
};

export default function Transcript(props: Props) {
  const currentI = createMemo(() => {
    const i = bSearch(
      props.transcript,
      props.currentTime,
      (tl, ct) => tl.start - ct,
    );

    if (i < 0) {
      return -i - 2;
    }

    return i;
  });

  createEffect(() => {
    const el = document.querySelector(
      `[data-start="${props.transcript[currentI()]?.start}"]`,
    ) as HTMLElement;

    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  return (
    <dl class="max-h-[500px] space-y-2 overflow-auto rounded-md bg-gray-100">
      <For each={props.transcript}>
        {(line, i) => (
          <div
            role="button"
            class="group flex gap-2 px-2 py-1 hover:cursor-pointer"
            classList={{
              'bg-indigo-50': i() === currentI(),
            }}
            data-start={line.start}
          >
            <dt class="w-10 items-center font-mono text-sm font-medium uppercase text-gray-400 group-hover:text-gray-600">
              {formatTime(line.start)}
            </dt>
            <dd class="text-sm">{line.text}</dd>
          </div>
        )}
      </For>
    </dl>
  );
}
