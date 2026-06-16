/**
 * Scroll `target` to the vertical center of its scroll `container` by adjusting
 * only the container's `scrollTop` — never the window.
 *
 * `Element.scrollIntoView({ block: 'center' })` walks up *every* scrollable
 * ancestor (including the document/body), so on the media page it yanks the
 * whole page to center the active transcript line in the viewport instead of
 * keeping the scroll inside the transcript panel. Driving the container's
 * scrollTop ourselves keeps the movement contained to that panel.
 */
export function scrollToCenterWithin(
  container: HTMLElement,
  target: Element,
  behavior: ScrollBehavior = 'smooth',
) {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const delta =
    targetRect.top -
    containerRect.top -
    (container.clientHeight - targetRect.height) / 2;
  // scrollTo clamps to the valid range, so an out-of-bounds delta is fine.
  container.scrollTo({ top: container.scrollTop + delta, behavior });
}
