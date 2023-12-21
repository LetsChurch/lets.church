import { onCleanup } from 'solid-js';

export default function clickOutside(
  node: HTMLElement,
  fn: (event: MouseEvent) => unknown,
) {
  const handleClick = (event: MouseEvent) => {
    if (
      node &&
      event.target instanceof Node &&
      !node.contains(event.target) &&
      !event.defaultPrevented
    ) {
      fn(event);
    }
  };

  document.addEventListener('click', handleClick, true);

  onCleanup(() => {
    document.removeEventListener('click', handleClick, true);
  });
}
