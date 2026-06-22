import { useSyncExternalStore } from 'react';

// SSR-safe media-query hook. Returns `false` on the server and on the first
// client render (no `window`), then the real match after hydration — so it never
// causes a hydration mismatch. Use it to switch between layouts that are
// otherwise CSS-gated, e.g. opening a mobile drawer vs. a desktop side rail.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// The reader switches its study panel from a right-hand rail (desktop) to a
// bottom drawer (mobile) at the Tailwind `lg` breakpoint (1024px) — the width at
// which a 340px rail beside the 660px reading column stops fitting comfortably.
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
