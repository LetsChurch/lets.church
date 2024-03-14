import { createEffect, type JSX, type ParentProps } from 'solid-js';
import { cn } from '../../../util';

export default function ResultRow(
  props: ParentProps<Pick<JSX.IntrinsicElements['li'], 'onClick' | 'id'>> & {
    activeId: string | null;
  },
) {
  let el: HTMLLIElement;

  createEffect(() => {
    if (props.id === props.activeId) {
      el.scrollIntoView({ block: 'nearest' });
    }
  });

  return (
    <li
      ref={el!}
      class={cn(
        'group flex cursor-pointer select-none items-center py-2 hover:bg-gray-200 focus:bg-gray-200',
        props.activeId === props.id ? 'bg-gray-200' : null,
      )}
      role="button"
      // eslint-disable-next-line solid/reactivity
      onClick={props.onClick}
    >
      {props.children}
    </li>
  );
}
