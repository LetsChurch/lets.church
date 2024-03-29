import { onCleanup } from 'solid-js';

export function useCleanupSignal(condition = true) {
  const controller = new AbortController();

  onCleanup(() => {
    if (condition) {
      controller.abort();
    }
  });

  return controller.signal;
}
