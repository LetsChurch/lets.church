/**
 * Creates an abortable setTimeout that can be cancelled via an AbortController
 * @param callback Function to execute after the timeout
 * @param delay Delay in milliseconds
 * @param signal Optional AbortSignal to cancel the timeout
 * @returns Timeout ID that can be used with clearTimeout
 */
export function abortableSetTimeout(
  callback: () => void,
  delay: number,
  signal?: AbortSignal,
): number | undefined {
  if (signal?.aborted) {
    return undefined;
  }

  const timeoutId = window.setTimeout(() => {
    if (!signal?.aborted) {
      callback();
    }
  }, delay);

  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeoutId);
      },
      { once: true },
    );
  }

  return timeoutId;
}
