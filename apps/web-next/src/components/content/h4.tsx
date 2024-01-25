import slugify from 'slugify';
import { type JSX, splitProps } from 'solid-js';
import { cn } from '~/util';

export type Props = Omit<JSX.IntrinsicElements['h4'], 'children'> & {
  children: string;
};

export default function H1(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class', 'children']);

  return (
    <h4
      id={slugify(localProps.children, { lower: true, strict: true })}
      class={cn(
        'mt-8 text-lg font-bold tracking-tight text-gray-900',
        localProps.class,
      )}
      {...restProps}
    >
      {localProps.children}
    </h4>
  );
}
