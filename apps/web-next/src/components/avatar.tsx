import { Show } from 'solid-js';
import { cn, type Optional } from '../util';

export type Props = {
  src?: Optional<string>;
  name?: Optional<string>;
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  alt?: string;
  class?: string;
};

function getInitials(name: string) {
  const rx = /(\p{L}{1})\p{L}+/gu;
  const split = [...name.matchAll(rx)] || [];
  return ((split.shift()?.[1] || '') + (split.pop()?.[1] || '')).toUpperCase();
}

export function Avatar(props: Props) {
  const initials = () => (props.name ? getInitials(props.name) : '');
  const size = () =>
    props.size === '2xl'
      ? 'size-24'
      : props.size === 'xl'
        ? 'size-16'
        : props.size === 'lg'
          ? 'size-12'
          : props.size === 'md'
            ? 'size-10'
            : props.size === 'sm'
              ? 'size-8'
              : 'size-6';
  const textSize = () =>
    props.size === '2xl'
      ? 'text-2xl'
      : props.size === 'xl'
        ? 'text-xl'
        : props.size === 'lg'
          ? 'text-lg'
          : props.size === 'md'
            ? 'text-md'
            : props.size === 'sm'
              ? 'text-sm'
              : 'text-xs';

  return (
    <Show
      when={props.src}
      keyed
      fallback={
        <span
          class={cn(
            'inline-flex items-center justify-center rounded-full bg-gray-500',
            size(),
            props.class,
          )}
        >
          <span class={cn('font-medium leading-none text-white', textSize())}>
            {initials()}
          </span>
        </span>
      }
    >
      {(src) => (
        <img
          class={cn(
            `inline-block aspect-square rounded-full bg-gray-200 object-cover text-transparent`,
            size(),
            props.class,
          )}
          src={src}
          alt={props.alt ?? 'Avatar'}
        />
      )}
    </Show>
  );
}
