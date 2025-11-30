import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import Cookies from 'js-cookie';

export const TRANSCRIPT_WIDTH_COOKIE_NAME = 'lc-transcript-width';
export const TRANSCRIPT_WIDTH_CHANGE_EVENT = 'transcript-width-change';
export const DEFAULT_TRANSCRIPT_WIDTH = 368;

export const getInitialTranscriptWidth = createIsomorphicFn()
  .client(() => {
    const stored = Cookies.get(TRANSCRIPT_WIDTH_COOKIE_NAME);
    if (stored) {
      const parsed = Number.parseInt(stored, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return DEFAULT_TRANSCRIPT_WIDTH;
  })
  .server(() => {
    const stored = getCookie(TRANSCRIPT_WIDTH_COOKIE_NAME);
    if (stored) {
      const parsed = Number.parseInt(stored, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return DEFAULT_TRANSCRIPT_WIDTH;
  });

export function setTranscriptWidth(width: number) {
  if (typeof window !== 'undefined') {
    Cookies.set(TRANSCRIPT_WIDTH_COOKIE_NAME, width.toString(), {
      expires: 365, // 1 year
    });
    window.dispatchEvent(
      new CustomEvent(TRANSCRIPT_WIDTH_CHANGE_EVENT, { detail: { width } }),
    );
  }
}
