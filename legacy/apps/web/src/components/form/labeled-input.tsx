import { createUniqueId, mergeProps, Show } from 'solid-js';
import type { Optional } from '~/util';

export default function LabeledInput(props: {
  name: string;
  label: string;
  error?: Optional<string | Array<string>>;
  type?: string;
}) {
  const merged = mergeProps({ type: 'text' }, props);
  const id = createUniqueId();

  return (
    <div>
      <label for={id} class="block text-sm font-medium text-gray-700">
        {merged.label}
      </label>
      <input
        id={id}
        name={merged.name}
        type={merged.type}
        placeholder={merged.label}
        class="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
        aria-invalid="true"
      />
      <Show when={props.error}>
        <p role="alert" class="text-sm font-bold text-red-600">
          {props.error}
        </p>
      </Show>
    </div>
  );
}
