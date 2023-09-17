import slugify from 'slugify';
import { JSX, splitProps } from 'solid-js';
import { cn } from '~/util';

export type Props = Omit<JSX.IntrinsicElements['h3'], 'children'> & {
  children: string;
};

export default function H1(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class', 'children']);

  return (
    <h3
      id={slugify(localProps.children, { lower: true, strict: true })}
      class={cn(
        'mt-8 text-xl font-bold tracking-tight text-gray-900',
        localProps.class,
      )}
      {...restProps}
    >
      {localProps.children}
    </h3>
  );
}
