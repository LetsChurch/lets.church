import { JSX, splitProps } from 'solid-js';

export type Props = JSX.IntrinsicElements['h1'];

export default function H1(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class']);

  return (
    <h1
      class={`mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl ${
        localProps.class ?? ''
      }`}
      {...restProps}
    />
  );
}
