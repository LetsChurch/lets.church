import { atom } from 'nanostores';

export const $currentTime = atom<number>(0);
// Seek requests for the persistent player. Write through `seekTo`, not `set`:
// an atom ignores a value equal to the one it holds, so seeking to the same
// spot twice (e.g. clicking a citation again after playback moved on) would
// otherwise do nothing.
export const $setPlayAt = atom<number | null>(null);

export function seekTo(seconds: number): void {
  $setPlayAt.set(null);
  $setPlayAt.set(seconds);
}
