import { For, mergeProps, splitProps, untrack, type JSX } from 'solid-js';

export type Props = Omit<JSX.IntrinsicElements['select'], 'value'> & {
  options: Array<{ label: string; value: string; disabled?: boolean }>;
  value?: string | undefined;
};

export default function Select(incomingProps: Props) {
  const props = mergeProps({ value: '' }, incomingProps);
  const [localProps, restProps] = splitProps(props, [
    'options',
    'value',
    'class',
  ]);

  return (
    <select
      {...restProps}
      class={`block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm ${
        localProps.class ?? ''
      }`}
    >
      <For each={localProps.options}>
        {(op) => (
          <option
            value={op.value}
            selected={untrack(() => props.value === op.value && !op.disabled)}
            disabled={op.disabled ?? false}
          >
            {op.label}
          </option>
        )}
      </For>
    </select>
  );
}
