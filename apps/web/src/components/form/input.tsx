import { JSX, splitProps } from 'solid-js';
import { cn } from '~/util';

export type Props = JSX.IntrinsicElements['input'];

export default function Input(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class']);

  return (
    <input
      {...restProps}
      class={cn(
        'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm',
        'focus:border-indigo-500 focus:outline-none focus:ring-indigo-500',
        'sm:text-sm',
        localProps.class,
      )}
    />
  );
}
