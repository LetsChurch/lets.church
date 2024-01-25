import { createUniqueId, type JSX, Show } from 'solid-js';
import type { Optional } from '~/util';

export default function LabeledInput(props: {
  name: string;
  label: string | JSX.Element;
  error?: Optional<string | Array<string>>;
  checked?: boolean;
}) {
  const id = createUniqueId();

  return (
    <div class="relative flex items-start">
      <div class="flex h-6 items-center">
        <input
          id={id}
          aria-describedby="comments-description"
          name={props.name}
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
          checked={props.checked || false}
        />
      </div>
      <div class="ml-3 text-sm leading-6">
        <label for={id} class="font-medium text-gray-900">
          {props.label}
        </label>
        <Show when={props.error}>
          <p id="comments-description" class="text-sm font-bold text-red-600">
            {props.error}
          </p>
        </Show>
      </div>
    </div>
  );
}
