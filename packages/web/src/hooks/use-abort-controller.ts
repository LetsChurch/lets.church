import { useEffect, useRef } from 'react';

/**
 * Creates an AbortController that is automatically aborted when the component unmounts
 * @returns AbortController instance tied to component lifecycle
 */
export function useAbortController(): AbortController {
  const abortControllerRef = useRef<AbortController | null>(null);

  if (!abortControllerRef.current) {
    abortControllerRef.current = new AbortController();
  }

  useEffect(() => {
    const controller = abortControllerRef.current;
    return () => {
      controller?.abort();
    };
  }, []);

  return abortControllerRef.current;
}
