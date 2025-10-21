import { atom } from 'nanostores';
import { useEffect } from 'react';

export const $headerBackgroundImage = atom<string | undefined>(undefined);

/**
 * Hook to set the header background image for the current page.
 *
 * Setting the store value doesn't require an effect - we can do it during render
 * because Nanostores updates are idempotent and don't cause unwanted re-renders.
 * However, we DO need an effect for cleanup on unmount to reset the background.
 *
 * See: https://react.dev/learn/you-might-not-need-an-effect
 */
export function useSetBackgroundImage(imageUrl: string | undefined) {
  // Set during render - no effect needed for this part
  $headerBackgroundImage.set(imageUrl);

  // Effect only needed for cleanup on unmount
  useEffect(() => {
    return () => {
      $headerBackgroundImage.set(undefined);
    };
  }, []);
}
