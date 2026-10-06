/**
 * What the user is looking at in YouTube Studio. Selectors verified against
 * Studio in October 2026; Studio is a Polymer SPA, so callers re-read these on
 * navigation rather than caching nodes.
 */

const VIDEO_PATH = /^\/video\/([\w-]{11})(?:\/|$)/;
const ROW_SELECTOR = 'ytcp-video-row';
const ROW_LINK_SELECTOR = 'a#video-title[href*="/video/"]';
const ROW_CHECKED_SELECTOR = '[role="checkbox"][aria-checked="true"]';

export type StudioPage =
  | { kind: 'video'; videoId: string }
  | { kind: 'list' }
  | { kind: 'other' };

export function currentStudioPage(
  pathname: string = location.pathname,
): StudioPage {
  const video = VIDEO_PATH.exec(pathname);
  if (video?.[1]) {
    return { kind: 'video', videoId: video[1] };
  }
  if (/^\/channel\/[\w-]+\/(videos|content)/.test(pathname)) {
    return { kind: 'list' };
  }
  return { kind: 'other' };
}

export function videoIdFromHref(href: string | null): string | null {
  if (!href) {
    return null;
  }
  return VIDEO_PATH.exec(new URL(href, location.origin).pathname)?.[1] ?? null;
}

/** Video ids of the rows ticked in the Content list (current page only). */
export function selectedVideoIds(root: ParentNode = document): Array<string> {
  const ids: Array<string> = [];
  for (const row of root.querySelectorAll(ROW_SELECTOR)) {
    if (!row.querySelector(ROW_CHECKED_SELECTOR)) {
      continue;
    }
    const id = videoIdFromHref(
      row.querySelector(ROW_LINK_SELECTOR)?.getAttribute('href') ?? null,
    );
    if (id) {
      ids.push(id);
    }
  }
  return ids;
}
