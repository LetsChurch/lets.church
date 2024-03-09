import { Show } from 'solid-js';
import { cn } from '../../../util';

export type Color =
  | 'gray'
  | 'red'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'pink';

export type Props = {
  children: string;
  color: Color | Uppercase<Color>;
  class?: string;
  onRemove?: () => void;
};

function getMainColorClasses(color: Color | Uppercase<Color>): string {
  switch (color.toLowerCase() as Color) {
    case 'gray':
      return 'bg-gray-50 text-gray-600 ring-gray-500/10';
    case 'red':
      return 'bg-red-50 text-red-700 ring-red-600/10';
    case 'yellow':
      return 'bg-yellow-50 text-yellow-800 ring-yellow-600/20';
    case 'green':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'blue':
      return 'bg-blue-50 text-blue-700 ring-blue-700/10';
    case 'indigo':
      return 'bg-indigo-50 text-indigo-700 ring-indigo-700/10';
    case 'purple':
      return 'bg-purple-50 text-purple-700 ring-purple-700/10';
    case 'pink':
      return 'bg-pink-50 text-pink-700 ring-pink-700/10';
  }
}

function getButtonColorClass(color: Color | Uppercase<Color>): string {
  switch (color.toLowerCase() as Color) {
    case 'gray':
      return 'hover:bg-gray-500/20';
    case 'red':
      return 'hover:bg-red-600/20';
    case 'yellow':
      return 'hover:bg-yellow-600/20';
    case 'green':
      return 'hover:bg-green-600/20';
    case 'blue':
      return 'hover:bg-blue-600/20';
    case 'indigo':
      return 'hover:bg-indigo-600/20';
    case 'purple':
      return 'hover:bg-purple-600/20';
    case 'pink':
      return 'hover:bg-pink-600/20';
  }
}

function getSvgColorClasses(color: Color | Uppercase<Color>): string {
  switch (color.toLowerCase() as Color) {
    case 'gray':
      return 'stroke-gray-600/50 group-hover:stroke-gray-600/75';
    case 'red':
      return 'stroke-red-600/50 group-hover:stroke-red-600/75';
    case 'yellow':
      return 'stroke-yellow-700/50 group-hover:stroke-yellow-700/75';
    case 'green':
      return 'stroke-green-700/50 group-hover:stroke-green-700/75';
    case 'blue':
      return 'stroke-blue-700/50 group-hover:stroke-blue-700/75';
    case 'indigo':
      return 'stroke-indigo-600/50 group-hover:stroke-indigo-600/75';
    case 'purple':
      return 'stroke-violet-600/50 group-hover:stroke-violet-600/75';
    case 'pink':
      return 'stroke-pink-700/50 group-hover:stroke-pink-700/75';
  }
}

export default function Chiclet(props: Props) {
  return (
    <span
      class={cn(
        'inline-flex items-center gap-x-0.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
        getMainColorClasses(props.color),
        props.class,
      )}
    >
      <span class="max-w-32 overflow-hidden text-ellipsis">
        {props.children}
      </span>
      <Show when={props.onRemove} keyed>
        {(onRemove) => (
          <button
            type="button"
            class={cn(
              'group relative -mr-1 h-3.5 w-3.5 rounded-sm',
              getButtonColorClass(props.color),
            )}
            onClick={onRemove}
          >
            <span class="sr-only">Remove</span>
            <svg
              viewBox="0 0 14 14"
              class={cn(
                'h-3.5 w-3.5 stroke-gray-600/50',
                getSvgColorClasses(props.color),
              )}
            >
              <path d="M4 4l6 6m0-6l-6 6" />
            </svg>
            <span class="absolute -inset-1" />
          </button>
        )}
      </Show>
    </span>
  );
}
