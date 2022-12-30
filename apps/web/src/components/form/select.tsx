import { For, splitProps, type JSX } from 'solid-js';

export type Props = JSX.IntrinsicElements['select'] & {
  options: Array<{ label: string; value: string; disabled?: boolean }>;
};

export default function Select(props: Props) {
  const [localProps, restProps] = splitProps(props, ['options']);

  return (
    <select
      {...restProps}
      class="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
    >
      <For each={localProps.options}>
        {(op) => (
          <option value={op.value} disabled={op.disabled ?? false}>
            {op.label}
          </option>
        )}
      </For>
    </select>
  );
}
