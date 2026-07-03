import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copy text to the clipboard and expose a transient `copied` flag that flips
 * back to `false` after `resetMs`. Consolidates the copy-button reimplementations
 * that were scattered across the dashboard.
 *
 * The reset timer is cleared on unmount (and on re-copy), so it never fires
 * `setState` on an unmounted component. `navigator.clipboard.writeText` rejects
 * on insecure origins (http://) or when permission is denied; that's swallowed
 * so callers don't need a try/catch around a copy click, and `copied` simply
 * stays `false`.
 */
export function useCopied(resetMs = 1500) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return;
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), resetMs);
    },
    [resetMs],
  );

  return { copied, copy };
}
