import { atom } from 'nanostores';

/**
 * The most recent search query, kept in memory so the global search bar shows it
 * on every page. The header (and `SearchBar`) is rendered per route, so it
 * remounts on navigation — without this the bar would be empty everywhere except
 * `/search`. It's mirrored from the `/search` URL query and read by every
 * `SearchBar` on mount. Resets on a full page reload (a `/search` load re-seeds
 * it from the URL).
 */
export const $lastSearchQuery = atom<string>('');
