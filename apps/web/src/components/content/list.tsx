import { JSX, splitProps } from 'solid-js';
import { cn } from '~/util';

export type Props = JSX.IntrinsicElements['li'];

export default function Ul(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class']);

  return (
    <li class={cn('ml-8 mt-4 list-disc', localProps.class)} {...restProps} />
  );
}
