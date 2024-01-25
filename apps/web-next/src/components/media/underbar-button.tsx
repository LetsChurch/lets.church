import { type JSX, splitProps } from 'solid-js';
import { cn } from '~/util';

export default function UnderbarButton(props: JSX.IntrinsicElements['button']) {
  const [localProps, restProps] = splitProps(props, ['class']);
  return (
    <button
      {...restProps}
      class={cn(
        'relative inline-flex items-center space-x-2 border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 first-of-type:rounded-l-md last-of-type:rounded-r-md only-of-type:shadow-sm hover:bg-gray-50 focus:z-10 focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 [&:not(:first-of-type)]:-ml-px',
        localProps.class,
      )}
    />
  );
}
