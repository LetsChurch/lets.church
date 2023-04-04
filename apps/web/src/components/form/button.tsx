import { type JSX, mergeProps, splitProps } from 'solid-js';

export type Props = {
  variant?: 'primary' | 'secondary';
} & JSX.IntrinsicElements['button'];

export default function Button(props: Props) {
  const merged = mergeProps(
    { type: 'button' as const, variant: 'primary' },
    props,
  );
  const [local, rest] = splitProps(merged, ['class', 'variant']);

  const variantClasses = () =>
    local.variant === 'primary'
      ? 'text-white hover:bg-indigo-700 bg-indigo-600'
      : 'text-gray-900 bg-gray-100 hover:bg-gray-200';

  return (
    <button
      {...rest}
      class={`inline-flex justify-center rounded-md border border-transparent px-4 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${variantClasses()} ${
        local.class ?? ''
      }`}
    />
  );
}
