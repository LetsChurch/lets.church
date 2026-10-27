import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * "Priority+" overflow for a single row of controls: every item stays inline
 * while the row has room, and items move into an overflow menu (hiding in
 * `hideOrder`) only once they no longer fit.
 *
 * Every item and the overflow trigger stay mounted. Callers take hidden ones
 * out of the flow (`absolute invisible`) rather than unmounting them, so their
 * widths can still be measured when deciding whether they fit again.
 *
 * `idealWidth` is the row's width (padding included) with everything inline. Using it as the
 * row's flex-basis lets a wrapping parent move the row onto its own line
 * before anything is hidden, and keeps that choice stable as items hide.
 */
export function useOverflowItems<K extends string>(
  keys: readonly K[],
  hideOrder: readonly K[],
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const itemEls = useRef(new Map<K, HTMLElement>());
  const [hidden, setHidden] = useState<ReadonlySet<K>>(() => new Set());
  const [idealWidth, setIdealWidth] = useState<number>();

  // One stable callback per key, so React doesn't detach and reattach every
  // item ref on each render.
  const refCallbacks = useRef(new Map<K, (el: HTMLElement | null) => void>());
  const itemRef = useCallback((key: K) => {
    let cb = refCallbacks.current.get(key);
    if (!cb) {
      cb = (el) => {
        if (el) itemEls.current.set(key, el);
        else itemEls.current.delete(key);
      };
      refCallbacks.current.set(key, cb);
    }
    return cb;
  }, []);

  const keysId = keys.join();
  const hideOrderId = hideOrder.join();

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const compute = () => {
      const style = getComputedStyle(container);
      const gap = Number.parseFloat(style.columnGap) || 0;
      const padding =
        (Number.parseFloat(style.paddingLeft) || 0) +
        (Number.parseFloat(style.paddingRight) || 0);
      // Fractional widths: summing rounded offsetWidths can be off by a
      // pixel per item at the boundary.
      const available = container.getBoundingClientRect().width - padding;
      // Fractional widths at browser zoom can sum a hair over the container
      // even when everything fits. Keep the slack below a layout unit (1/64px)
      // so it never lets through a row the browser would actually wrap.
      const fits = (width: number) => width <= available + 0.01;
      const present = keys.filter((k) => itemEls.current.has(k));
      const widthOf = (k: K) =>
        itemEls.current.get(k)?.getBoundingClientRect().width ?? 0;
      const rowWidth = (shown: readonly K[], extra = 0) =>
        shown.reduce((sum, k) => sum + widthOf(k), extra) +
        gap * Math.max(0, shown.length - 1 + (extra > 0 ? 1 : 0));

      const ideal = rowWidth(present);
      setIdealWidth(ideal + padding);

      const next = new Set<K>();
      if (!fits(ideal)) {
        const trigger = triggerRef.current?.getBoundingClientRect().width ?? 0;
        for (const k of hideOrder) {
          if (!itemEls.current.has(k)) continue;
          next.add(k);
          const shown = present.filter((p) => !next.has(p));
          if (fits(rowWidth(shown, trigger))) break;
        }
      }

      setHidden((prev) =>
        prev.size === next.size && [...next].every((k) => prev.has(k))
          ? prev
          : next,
      );
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    for (const el of itemEls.current.values()) observer.observe(el);
    return () => observer.disconnect();
    // keysId/hideOrderId stand in for the arrays, which callers rebuild each
    // render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [keysId, hideOrderId]);

  return { containerRef, triggerRef, itemRef, hidden, idealWidth };
}
