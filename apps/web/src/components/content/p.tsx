import { JSX, splitProps } from 'solid-js';
import { cn } from '~/util';

export type Props = JSX.IntrinsicElements['p'];

export default function H1(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class']);

  return <p class={cn('mt-8', localProps.class)} {...restProps} />;
}
