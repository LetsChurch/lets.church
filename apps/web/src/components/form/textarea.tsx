import { JSX, splitProps } from 'solid-js';

export type Props = JSX.IntrinsicElements['textarea'];

export default function Input(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class']);

  return (
    <textarea
      {...restProps}
      class={`block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm ${
        localProps.class ?? ''
      }`}
    />
  );
}
