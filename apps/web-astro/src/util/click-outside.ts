import { useCleanupSignal } from './cleanup-signal';

export default function clickOutside(
  node: HTMLElement,
  fn: (event: MouseEvent) => unknown,
) {
  const cleanupSignal = useCleanupSignal();

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

  document.addEventListener('click', handleClick, {
    capture: true,
    signal: cleanupSignal,
  });
}
