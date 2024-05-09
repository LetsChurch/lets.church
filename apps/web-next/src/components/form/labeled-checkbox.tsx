import { createUniqueId, type JSX, Show, splitProps } from 'solid-js';
import type { Optional } from '~/util';

export default function LabeledInput(props: {
  name: string;
  label: string | JSX.Element;
  error?: Optional<string | Array<string>>;
  checked?: boolean;
  value: string;
}) {
  const [localProps, restProps] = splitProps(props, [
    'name',
    'label',
    'checked',
    'value',
    'error',
  ]);

  const id = createUniqueId();

  return (
    <div class="relative flex items-start">
      <div class="flex h-6 items-center">
        <input
          {...restProps}
          id={id}
          aria-describedby="comments-description"
          name={localProps.name}
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
          checked={localProps.checked ?? false}
          value={localProps.value}
        />
      </div>
      <div class="ml-3 text-sm leading-6">
        <label for={id} class="font-medium text-gray-900">
          {localProps.label}
        </label>
        <Show when={localProps.error}>
          <p id="comments-description" class="text-sm font-bold text-red-600">
            {localProps.error}
          </p>
        </Show>
      </div>
    </div>
  );
}
