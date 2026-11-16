import { useEffect, useRef, useState } from 'react';

/**
 * An abort signal tied to the component's lifecycle: aborted on unmount.
 *
 * Read `.signal` when you need it (e.g. in an event handler), not during
 * render. StrictMode's dev double-mount aborts the first controller on its
 * simulated unmount; the remount starts a fresh one, and this handle always
 * returns the live controller's signal.
 */
export function useAbortController(): { readonly signal: AbortSignal } {
  const controllerRef = useRef<AbortController>(null);

  useEffect(() => {
    if (!controllerRef.current || controllerRef.current.signal.aborted) {
      controllerRef.current = new AbortController();
    }
    const controller = controllerRef.current;
    return () => {
      controller.abort();
    };
  }, []);

  const [handle] = useState(() => ({
    get signal() {
      controllerRef.current ??= new AbortController();
      return controllerRef.current.signal;
    },
  }));

  return handle;
}
