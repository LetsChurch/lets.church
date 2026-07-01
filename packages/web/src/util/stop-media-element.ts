import type { HlsVideoElement } from 'hls-video-element';

/**
 * Fully stop an `<hls-video>` element on unmount so it can't keep emitting audio
 * once React has detached it ("phantom playback").
 *
 * Custom-element media players don't stop on disconnect: `custom-media-element`'s
 * `disconnectedCallback` neither pauses the media nor tears down hls.js, and its
 * `nativeEl` getter still resolves the shadow `<video>` after detach. Worse,
 * `hls-video-element` defers autoplay to hls.js's `MANIFEST_PARSED` event:
 *
 *   if (this.nativeEl.autoplay && this.nativeEl.paused) this.nativeEl.play();
 *
 * Because `load()` creates the hls.js instance asynchronously (`await
 * Promise.resolve()`), that manifest-parsed autoplay routinely fires *after* a
 * fast unmount. A plain `el.pause()` in cleanup then loses the race — it runs
 * while the element is still loading (already paused, so it's a no-op), and the
 * deferred `play()` starts detached audio nothing can pause.
 *
 * So we do three things, defensively, in order:
 *  - `pause()` stops any playback already in progress;
 *  - removing the `autoplay` attribute makes the manifest-parsed `play()` a
 *    no-op even when the hls.js instance hasn't been created yet at unmount;
 *  - `api?.destroy()` tears down hls.js when it does exist.
 */
export function stopMediaElement(el: HlsVideoElement | null | undefined) {
  if (!el) return;
  el.pause();
  el.removeAttribute('autoplay');
  el.api?.destroy();
}
