import type { BookChapter } from '@/db';
import { CANON } from '@/lib/canon';
import { trpcClient } from '@/trpc/react';
import { kvDelete, kvGet, kvKeys, kvSet } from './db';

// Offline reading cache: chapter reading-blocks stored in IndexedDB, keyed by
// `ch:<translation>:<slug>:<chapter>`. Chapters are cached as they're viewed
// (so recently-read passages work offline) and can be bulk-"downloaded" per
// translation. `dl:<translation>` marks a completed full download.

function chapterKey(
  translation: string,
  slug: string,
  chapter: number,
): string {
  return `ch:${translation}:${slug}:${chapter}`;
}

export async function cacheChapter(
  translation: string,
  slug: string,
  chapter: number,
  content: BookChapter,
): Promise<void> {
  await kvSet(chapterKey(translation, slug, chapter), content);
}

export async function getCachedChapter(
  translation: string,
  slug: string,
  chapter: number,
): Promise<BookChapter | null> {
  return (
    (await kvGet<BookChapter>(chapterKey(translation, slug, chapter))) ?? null
  );
}

// Persisted translations list, so the reader can resolve the default translation
// (for cache lookups) while offline. Written whenever the list is fetched.
const TRANSLATIONS_KEY = 'lb-translations';

export type CachedTranslation = {
  id: string;
  name: string;
  isDefault: boolean;
};

export function persistTranslations(list: CachedTranslation[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(TRANSLATIONS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function cachedDefaultTranslation(): string {
  if (typeof window === 'undefined') {
    return 'BSB';
  }
  try {
    const list = JSON.parse(
      localStorage.getItem(TRANSLATIONS_KEY) || '[]',
    ) as CachedTranslation[];
    return list.find((t) => t.isDefault)?.id ?? list[0]?.id ?? 'BSB';
  } catch {
    return 'BSB';
  }
}

// Resolve the translation the same way the server does, but client-side and
// offline-capable: explicit URL param > the `lb-prefs` cookie's translation
// (not HttpOnly, readable here) > the cached default. Used so the offline cache
// is read/written under the same id the reader actually shows.
function readPrefTranslation(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const m = document.cookie.match(/(?:^|;\s*)lb-prefs=([^;]+)/);
  if (!m) {
    return null;
  }
  try {
    const o = JSON.parse(decodeURIComponent(m[1])) as { translation?: unknown };
    return typeof o.translation === 'string' ? o.translation : null;
  } catch {
    return null;
  }
}

export function resolveTranslationClient(param?: string): string {
  return param ?? readPrefTranslation() ?? cachedDefaultTranslation();
}

// A chapter query that caches on success and falls back to the IndexedDB cache
// when the network is unavailable — giving offline reading for any chapter
// that's been viewed or downloaded. Shared by the route loader (SSR/prefetch)
// and the component so they share one cache entry.
export function chapterQueryOptions(params: {
  book: string;
  chapter: number;
  translation?: string;
}) {
  const { book, chapter, translation } = params;
  return {
    queryKey: ['bible.chapter', translation ?? null, book, chapter] as const,
    queryFn: async (): Promise<BookChapter | null> => {
      try {
        const data = await trpcClient.bible.chapter.query({
          book,
          chapter,
          translation,
        });
        if (data) {
          // Cache under the resolved id (no-op on the server).
          void cacheChapter(
            resolveTranslationClient(translation),
            book,
            chapter,
            data,
          );
        }
        return data;
      } catch (err) {
        const cached = await getCachedChapter(
          resolveTranslationClient(translation),
          book,
          chapter,
        );
        if (cached) {
          return cached;
        }
        throw err;
      }
    },
  };
}

// --- per-translation download ----------------------------------------------

function downloadedKey(translation: string): string {
  return `dl:${translation}`;
}

export async function isDownloaded(translation: string): Promise<boolean> {
  return (await kvGet<boolean>(downloadedKey(translation))) === true;
}

// Download an entire translation, one book at a time, reporting progress
// (0..1). Resolves when every book is cached.
export async function downloadTranslation(
  translation: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const total = CANON.length;
  let done = 0;
  for (const b of CANON) {
    const book = await trpcClient.bible.book.query({
      translation,
      book: b.slug,
    });
    if (book) {
      for (const [num, content] of Object.entries(book.chapters)) {
        await cacheChapter(translation, b.slug, Number(num), content);
      }
    }
    done += 1;
    onProgress?.(done, total);
  }
  await kvSet(downloadedKey(translation), true);
}

// Remove a downloaded translation's cached chapters.
export async function removeDownload(translation: string): Promise<void> {
  const keys = await kvKeys(`ch:${translation}:`);
  for (const k of keys) {
    try {
      await kvDelete(k);
    } catch {
      // keep deleting the rest even if one fails
    }
  }
  await kvDelete(downloadedKey(translation));
}
