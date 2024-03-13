import type { JSX, ParentProps } from 'solid-js';

export default function ResultRow(
  props: ParentProps<Pick<JSX.IntrinsicElements['li'], 'onClick'>>,
) {
  return (
    <li
      class="group flex cursor-pointer select-none items-center py-2 hover:bg-gray-200 focus:bg-gray-200"
      role="button"
      // eslint-disable-next-line solid/reactivity
      onClick={props.onClick}
    >
      {props.children}
    </li>
  );
}
