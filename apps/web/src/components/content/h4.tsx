import { JSX, splitProps } from 'solid-js';

export type Props = JSX.IntrinsicElements['h4'];

export default function H1(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class']);

  return (
    <h4
      class={`mt-8 text-lg font-bold tracking-tight text-gray-900 ${
        localProps.class ?? ''
      }`}
      {...restProps}
    />
  );
}
