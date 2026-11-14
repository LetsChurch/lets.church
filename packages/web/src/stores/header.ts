import { atom } from 'nanostores';
import { useSyncExternalStore } from 'react';

/**
 * The home page hero carousel's current slide image, which the header blurs
 * behind itself.
 *
 * This is a module-level store, so on the server it would be shared by every
 * request. Only write it from effects (browser-only), and read it through
 * `useCarouselBackgroundImage`, which always reports `undefined` on the server
 * and during hydration. Pages that know their header image at render time
 * (e.g. media) pass it to `MainLayout`/`Header` as a prop instead.
 */
export const $headerBackgroundImage = atom<string | undefined>(undefined);

const subscribe = (onChange: () => void) =>
  $headerBackgroundImage.listen(onChange);
const getSnapshot = () => $headerBackgroundImage.get();
const getServerSnapshot = () => undefined;

export function useCarouselBackgroundImage() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
