import { type JSX, mergeProps, splitProps } from 'solid-js';

export type Props = JSX.IntrinsicElements['button'];

export default function Button(props: Props) {
  const merged = mergeProps({ type: 'button' as const }, props);
  const [local, rest] = splitProps(merged, ['class']);

  return (
    <button
      {...rest}
      class={`ml-3 inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${local.class}`}
    />
  );
}
