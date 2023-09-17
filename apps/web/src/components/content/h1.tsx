import slugify from 'slugify';
import { JSX, splitProps } from 'solid-js';
import { cn } from '~/util';

export type Props = Omit<JSX.IntrinsicElements['h1'], 'children'> & {
  children: string;
};

export default function H1(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class', 'children']);

  return (
    <h1
      id={slugify(localProps.children, { lower: true, strict: true })}
      class={cn(
        'mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl',
        localProps.class,
      )}
      {...restProps}
    >
      {localProps.children}
    </h1>
  );
}
