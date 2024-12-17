import { createEffect, type ParentProps } from 'solid-js';
import invariant from 'tiny-invariant';
import { type Optional, cn } from '../../../util';

export default function ResultRow(
  props: ParentProps<{
    id: string;
    activeId?: Optional<string>;
    onClick: () => unknown;
  }>,
) {
  let el: HTMLLIElement;

  createEffect(() => {
    invariant(el!, 'ResultRow: el is undefined');
    if (props.activeId === props.id) {
      el.scrollIntoView({ block: 'nearest' });
    }
  });

  return (
    <li
      ref={el!}
      id={props.id}
      class={cn(
        'group flex cursor-pointer select-none items-center py-2 hover:bg-gray-200 focus:bg-gray-200',
        props.activeId === props.id ? 'bg-gray-200' : null,
      )}
      role="button"
      onClick={() => props.onClick()}
    >
      {props.children}
    </li>
  );
}
