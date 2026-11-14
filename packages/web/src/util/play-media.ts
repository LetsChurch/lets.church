/**
 * Starts playback, ignoring the rejections browsers produce as a matter of
 * course: `NotAllowedError` (autoplay or playback blocked by browser policy)
 * and `AbortError` (a pending `play()` interrupted by `pause()` or a source
 * change). Any other failure, such as `NotSupportedError` for media that can't
 * be decoded, is rethrown so it still surfaces as an unhandled rejection.
 */
export function playMedia(el: HTMLMediaElement) {
  el.play().catch((error: unknown) => {
    if (
      error instanceof DOMException &&
      (error.name === 'NotAllowedError' || error.name === 'AbortError')
    ) {
      return;
    }
    throw error;
  });
}
