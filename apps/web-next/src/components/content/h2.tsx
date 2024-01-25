import slugify from 'slugify';
import { type JSX, splitProps } from 'solid-js';
import { cn } from '~/util';

export type Props = Omit<JSX.IntrinsicElements['h2'], 'children'> & {
  children: string;
};

export default function H2(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class', 'children']);

  return (
    <h2
      id={slugify(localProps.children, { lower: true, strict: true })}
      class={cn(
        'mt-8 text-2xl font-bold tracking-tight text-gray-900',
        localProps.class,
      )}
      {...restProps}
    >
      {localProps.children}
    </h2>
  );
}
