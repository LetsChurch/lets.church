import { JSX, splitProps } from 'solid-js';
import { cn } from '~/util';

export type Props = JSX.IntrinsicElements['h2'];

export default function H1(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class']);

  return (
    <h2
      class={cn(
        'mt-8 text-2xl font-bold tracking-tight text-gray-900',
        localProps.class,
      )}
      {...restProps}
    />
  );
}
