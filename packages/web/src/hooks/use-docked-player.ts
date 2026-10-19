import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Dock once less than this fraction of the inline player is still on screen.
const DOCK_VISIBLE_RATIO = 0.3;
const DOCK_TRANSITION_MS = 300;
const DOCK_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
const DOCKED_STYLE_PROPS = ['position', 'top', 'left', 'width', 'z-index'];

/**
 * Docks the media page's player into a slot in the sidebar once the inline
 * player scrolls out of view, and undocks it when it scrolls back.
 *
 * The player element is never moved in the DOM: detaching a media element
 * pauses it (and re-mounting <hls-video> risks orphaned audio), so docking
 * only switches the floating wrapper to `position: fixed` over the slot. The
 * placeholder keeps the inline player's height so the page doesn't jump, and
 * the move between the two spots is animated with a FLIP transform.
 */
export function useDockedPlayer({ enabled }: { enabled: boolean }) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const fromRectRef = useRef<DOMRect | null>(null);
  const dockedRef = useRef(false);
  // Inline player height to hold open while docked; null when undocked.
  const [holdHeight, setHoldHeight] = useState<number | null>(null);
  // Height of the docked player, so the sidebar slot can reserve room for it.
  const [slotHeight, setSlotHeight] = useState(0);

  const isDocked = enabled && holdHeight !== null;

  useEffect(() => {
    const placeholder = placeholderRef.current;
    if (!enabled || !placeholder) {
      // Layout no longer has a sidebar (e.g. resized narrow): snap back inline.
      fromRectRef.current = null;
      dockedRef.current = false;
      setHoldHeight(null);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Entering/leaving fullscreen reflows the page; don't dock off that.
        if (!entry || document.fullscreenElement) return;
        const rootTop = entry.rootBounds?.top ?? 0;
        const shouldDock =
          entry.intersectionRatio < DOCK_VISIBLE_RATIO &&
          entry.boundingClientRect.top < rootTop;
        if (shouldDock === dockedRef.current) return;
        dockedRef.current = shouldDock;
        fromRectRef.current =
          floatingRef.current?.getBoundingClientRect() ?? null;
        setHoldHeight(shouldDock ? entry.boundingClientRect.height : null);
      },
      { threshold: [0, DOCK_VISIBLE_RATIO] },
    );
    observer.observe(placeholder);
    return () => observer.disconnect();
  }, [enabled]);

  useLayoutEffect(() => {
    const el = floatingRef.current;
    if (!el) return;
    const from = fromRectRef.current;
    fromRectRef.current = null;

    const slot = slotRef.current;
    if (!isDocked || !slot) {
      flip(el, from);
      return;
    }

    const place = () => {
      const rect = slot.getBoundingClientRect();
      el.style.position = 'fixed';
      el.style.top = `${rect.top}px`;
      el.style.left = `${rect.left}px`;
      el.style.width = `${rect.width}px`;
      el.style.zIndex = '20';
      setSlotHeight(el.offsetHeight);
    };
    place();
    flip(el, from);

    const ac = new AbortController();
    // The page scrolls inside <main>, not the window; scroll events don't
    // bubble, but a capturing listener on window still sees them.
    window.addEventListener('scroll', place, {
      capture: true,
      passive: true,
      signal: ac.signal,
    });
    window.addEventListener('resize', place, { signal: ac.signal });
    const resizeObserver = new ResizeObserver(place);
    resizeObserver.observe(slot);
    resizeObserver.observe(el);

    return () => {
      ac.abort();
      resizeObserver.disconnect();
      for (const prop of DOCKED_STYLE_PROPS) el.style.removeProperty(prop);
    };
  }, [isDocked]);

  return {
    placeholderRef,
    floatingRef,
    slotRef,
    isDocked,
    holdHeight,
    slotHeight: isDocked ? slotHeight : 0,
  };
}

// Animate `el` from its previous on-screen rect to where it is now.
function flip(el: HTMLElement, from: DOMRect | null) {
  if (!from || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  const to = el.getBoundingClientRect();
  if (!to.width || !to.height) return;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  el.animate(
    [
      {
        transformOrigin: 'top left',
        transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
      },
      { transformOrigin: 'top left', transform: 'none' },
    ],
    { duration: DOCK_TRANSITION_MS, easing: DOCK_EASING },
  );
}
