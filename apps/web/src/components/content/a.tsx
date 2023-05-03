import { ComponentProps, splitProps } from 'solid-js';
import { A } from 'solid-start';

export type Props = ComponentProps<typeof A>;

export default function ContentLink(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class']);

  return (
    <A class={`text-indigo-500 ${localProps.class ?? ''}`} {...restProps} />
  );
}
