import DragDropIcon from '@tabler/icons/drag-drop.svg?component-solid';
import { Accessor, createSignal, createUniqueId, Show } from 'solid-js';
import invariant from 'tiny-invariant';

export type DroppedRes = { title: string; progress: Accessor<number> };

export type Props = {
  caption?: string | undefined;
  name?: string;
  progressLabel?: string;
  accept?: string | undefined;
  onDrop: (file: File, mime: string) => DroppedRes;
  disabled?: boolean;
};

function renderPercent(percent = 0) {
  if (percent === 1) {
    return '100%';
  }

  if (percent === 0) {
    return '0%';
  }

  return `${(percent * 100).toFixed(1)}%`;
}

export default function Dropzone(props: Props) {
  const [draggingOver, setDraggingOver] = createSignal(false);
  const [droppedRes, setDroppedRes] = createSignal<DroppedRes | null>(null);

  function handleDragOver(e: DragEvent) {
    if (droppedRes()) {
      return;
    }

    e.preventDefault();
    setDraggingOver(true);
  }

  function mimeMatches(mime: string) {
    return (
      props.accept
        ?.split(',')
        .map((s) => new RegExp(s.replace('*', '.+')))
        .some((r) => r.test(mime)) ?? true
    );
  }

  function handleInput(e: InputEvent) {
    invariant(e.target instanceof HTMLInputElement);
    invariant(e.target.files);
    const [file] = Array.from(e.target.files).filter((f) =>
      mimeMatches(f.type),
    );

    if (file) {
      const res = props.onDrop(file, file.type);
      setDroppedRes(res);
    }
  }

  function handleDrop(e: DragEvent) {
    if (droppedRes() || props.disabled) {
      return;
    }

    e.preventDefault();
    setDraggingOver(false);

    const [item] = Array.from(e.dataTransfer?.items ?? [])
      .filter((i) => i.kind === 'file')
      .filter((i) => mimeMatches(i.type));
    const file = item?.getAsFile();

    if (file) {
      const res = props.onDrop(file, file.type);
      setDroppedRes(res);
    }
  }

  const inputId = createUniqueId();

  return (
    <div
      class={`relative mt-1 flex justify-center rounded-md border-2 px-6 pb-6 pt-5 ${
        droppedRes()
          ? `border-solid ${
              (droppedRes()?.progress() ?? 0) < 1
                ? 'border-indigo-200'
                : 'border-green-200'
            }`
          : 'border-dashed border-gray-300'
      }`}
      classList={{
        'bg-gray-50': draggingOver(),
        'opacity-75': props.disabled,
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragExit={() => setDraggingOver(false)}
    >
      <Show when={droppedRes()}>
        <div
          class="absolute inset-0 bg-gray-50"
          classList={{
            'bg-indigo-50': (droppedRes()?.progress() ?? 0) < 1,
            'bg-green-50': (droppedRes()?.progress() ?? 0) === 1,
          }}
          style={{ width: renderPercent(droppedRes()?.progress()) }}
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="1"
          aria-valuenow={droppedRes()?.progress() ?? 0}
          {...(props.progressLabel
            ? { 'aria-label': props.progressLabel }
            : {})}
        />
      </Show>
      <div class="z-10 space-y-1 text-center">
        <Show
          when={droppedRes()}
          fallback={
            <>
              <DragDropIcon class="mx-auto h-12 w-12 text-gray-400" />
              <div class="flex justify-center text-sm text-gray-600">
                <label
                  for={inputId}
                  class={`relative rounded-md font-medium focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 ${
                    props.disabled
                      ? 'text-gray-600'
                      : 'cursor-pointer text-indigo-600 focus-within:ring-indigo-500 hover:text-indigo-500 '
                  }`}
                >
                  <span>Upload a file</span>
                  <input
                    id={inputId}
                    {...(props.name ? { name: props.name } : {})}
                    type="file"
                    onInput={handleInput}
                    {...(props.accept ? { accept: props.accept } : {})}
                    disabled={props.disabled ?? false}
                    class="sr-only"
                  />
                </label>
                <p class="pl-1">or drag and drop</p>
              </div>
              <Show when={props.caption}>
                <p class="text-xs text-gray-500">{props.caption}</p>
              </Show>
            </>
          }
        >
          <p
            class="trackin-tight text-5xl font-bold"
            classList={{
              'text-indigo-600': droppedRes()?.progress() !== 1,
              'text-green-600': droppedRes()?.progress() === 1,
            }}
          >
            {renderPercent(droppedRes()?.progress())}
          </p>
          <p
            class="pl-1 text-lg font-medium text-gray-600"
            classList={{
              'text-indigo-600': (droppedRes()?.progress() ?? 0) < 1,
              'text-green-600': (droppedRes()?.progress() ?? 0) === 1,
            }}
          >
            {droppedRes()?.title}
          </p>
        </Show>
      </div>
    </div>
  );
}
