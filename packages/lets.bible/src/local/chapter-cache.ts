import type { BookChapter } from '@/db';
import { applyOverlays, type OverlayIndex } from '@/lib/apply-overlays';
import { bookBySlug } from '@/lib/canon';
import { deriveVerses } from '@/lib/derive-verses';

// Reading asset keys use the url slug ("john"); the overlay index is keyed by USFM
// code ("JHN").
const usfmOf = (slug: string) => bookBySlug(slug)?.code ?? slug.toUpperCase();

// Reading source: the reader fetches a book's chapters from the static asset
// /reading/<id>/<slug>.json (built at image time from USX by build-flex-index.ts,
// service-worker cached for offline). No Postgres and no IndexedDB — the SW is
// the offline cache, and an idle pass (local/precache.ts) pulls the whole active
// translation so it all works offline without a download step.

const isClient = typeof window !== 'undefined';

// On the server (SSR) fetch from the app's own static handler, like the tRPC
// client does; on the client use a relative URL (served by the SW / network).
function assetBase(): string {
  return isClient ? '' : `http://localhost:${process.env.PORT ?? 3000}`;
}

// Per-(translation, book) in-memory cache so navigating chapters within a book
// doesn't re-fetch/re-parse the book JSON. Client-only: the content is static, so
// this is safe, while the server avoids unbounded per-book memory growth.
const bookCache = new Map<string, Record<string, BookChapter>>();

async function loadBook(
  translationId: string,
  book: string,
): Promise<Record<string, BookChapter>> {
  const key = `${translationId}/${book}`;
  if (isClient) {
    const hit = bookCache.get(key);
    if (hit) {
      return hit;
    }
  }
  const res = await fetch(`${assetBase()}/reading/${key}.json`);
  if (!res.ok) {
    throw new Error(`Failed to load reading asset ${key} (${res.status})`);
  }
  const chapters = (await res.json()) as Record<string, BookChapter>;
  if (isClient) {
    bookCache.set(key, chapters);
  }
  return chapters;
}

// The translation-independent source-text-overlay index (the committed
// seed/overlays/index.json, served at /overlays/index.json). Fetched once and
// applied to a chapter's runs at load time so divine name / OT quotation /
// divine-name notes render without being baked into any translation.
let overlayIndex: Promise<OverlayIndex> | null = null;
function loadOverlayIndex(): Promise<OverlayIndex> {
  if (!overlayIndex) {
    overlayIndex = fetch(`${assetBase()}/overlays/index.json`)
      .then((r) => (r.ok ? (r.json() as Promise<OverlayIndex>) : {}))
      .catch(() => ({}) as OverlayIndex);
  }
  return overlayIndex;
}

// A chapter query backed by the static reading asset. The service worker serves
// it offline (cache-first in prod), so there's no separate IndexedDB fallback.
// Shared by the route loader (SSR/prefetch) and the component so they hit one
// cache entry — callers pass a concrete, resolved translation id.
export function chapterQueryOptions(params: {
  book: string;
  chapter: number;
  translationId: string;
}) {
  const { book, chapter, translationId } = params;
  return {
    queryKey: ['bible.chapter', translationId, book, chapter] as const,
    queryFn: async (): Promise<BookChapter | null> => {
      const [chapters, index] = await Promise.all([
        loadBook(translationId, book),
        loadOverlayIndex(),
      ]);
      const data = chapters[String(chapter)];
      if (!data) {
        return null;
      }
      // Apply the source-text overlays at render time (the reading asset is
      // overlay-pure); the book code here is the USFM code (the asset key's slug
      // maps 1:1, but the index is keyed by USFM, so resolve it). The asset omits
      // the per-verse text map (all but a few boundary exceptions), so rebuild it
      // from the runs and let the shipped exceptions override.
      const withOverlays = applyOverlays(usfmOf(book), chapter, data, index);
      return {
        ...withOverlays,
        verses: {
          ...deriveVerses(withOverlays.blocks),
          ...withOverlays.verses,
        },
      };
    },
  };
}

// Persisted translations list, so the translation can be resolved (for asset
// keys) while offline before the translations query rehydrates.
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

// Resolve the translation to read: explicit URL param > saved preference >
// default translation (from the translations list, falling back to the cached
// default). Used by both the loader and the reader so their query keys match.
export function resolveTranslationId(
  param: string | undefined,
  prefTranslation: string | null | undefined,
  translations: { id: string; isDefault: boolean }[] | undefined,
): string {
  return (
    param ??
    prefTranslation ??
    translations?.find((t) => t.isDefault)?.id ??
    translations?.[0]?.id ??
    cachedDefaultTranslation()
  );
}
