import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { bookBySlug, findBook } from '@/lib/canon';
import { collections } from './collections';
import { scheduleSync } from './sync';
import type {
  HighlightColor,
  LocalHighlight,
  LocalNote,
  LocalProgress,
} from './types';

// Local-first read hooks + write ops over the TanStack DB collections. Writes
// stamp `updatedAt` + `dirty` and kick a debounced server sync; the UI updates
// instantly (offline-safe). Deletions are tombstones (deleted=true) so they
// propagate to the server before being pruned.
//
// Reads use `useSyncExternalStore` (not react-db's `useLiveQuery`) so they're
// SSR-safe: the server snapshot is always empty, and the client subscribes to
// the collection after hydration. Marks are a personalization overlay, so
// rendering empty on the server then filling in on the client is correct (and
// matches the first client paint — no hydration mismatch).

const EMPTY: never[] = [];

type ReadableCollection<T> = {
  toArray: T[];
  subscribeChanges: (cb: () => void) => { unsubscribe: () => void };
};

// The TanStack DB localStorage collections hydrate ASYNCHRONOUSLY: `toArray` is
// empty until the collection's lazy sync loads the persisted rows (after the
// first paint). For reader marks that means a saved highlight visibly "flashes
// in" a frame or two after the chapter renders. To avoid that, we read the same
// localStorage blob synchronously on the first client render and seed the
// snapshot, so the mark is present in the first painted client frame — the
// collection then takes over once it loads. (SSR still renders empty: the server
// has no localStorage, and the useSyncExternalStore server snapshot stays empty,
// matching the server HTML — only the client gets the synchronous seed.)
//
// The blob shape mirrors what the collections persist: a map of storage-key →
// `{ versionKey, data: <row> }` (the same shape sync.ts reads in countLive).
function readLocalRows<T>(storageKey: string): T[] {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Record<string, { data?: T } | null>;
    const rows: T[] = [];
    for (const entry of Object.values(parsed)) {
      if (entry?.data) rows.push(entry.data);
    }
    return rows.length ? rows : EMPTY;
  } catch {
    return EMPTY;
  }
}

function useCollectionRows<T>(
  collection: ReadableCollection<T>,
  storageKey: string,
): T[] {
  const ref = useRef<T[]>(EMPTY);
  // Seed the snapshot synchronously from localStorage on the first client
  // render so saved rows are in the first painted frame instead of flashing in
  // after the collection's async hydration. No-op on the server (readLocalRows
  // returns EMPTY) and once seeded (ref is no longer EMPTY).
  if (ref.current === EMPTY) {
    ref.current = readLocalRows<T>(storageKey);
  }
  const subscribe = useCallback(
    (onChange: () => void) => {
      const refresh = () => {
        const rows = collection.toArray;
        // Don't let a not-yet-hydrated (empty) collection clobber the
        // localStorage seed — the collection re-fires once it loads. This is
        // safe because deletions are tombstones (deleted=true rows remain), so
        // a loaded collection is never empty while any row still exists.
        if (rows.length === 0 && ref.current.length > 0) return;
        ref.current = rows;
        onChange();
      };
      // Subscribing starts the collection's lazy sync, which loads existing
      // localStorage data. That initial load may land synchronously during
      // (or right after) subscribe without re-firing the change listener, so
      // we refresh the snapshot once after subscribing — otherwise a freshly
      // loaded page would render empty until the next write.
      const sub = collection.subscribeChanges(refresh);
      refresh();
      return () => sub.unsubscribe();
    },
    [collection],
  );
  return useSyncExternalStore(
    subscribe,
    () => ref.current,
    () => EMPTY,
  );
}

export function usfmOf(slug: string): string {
  return bookBySlug(slug)?.code ?? slug.toUpperCase();
}
function refOf(slug: string, chapter: number, verse: number): string {
  return `${usfmOf(slug)}.${chapter}.${verse}`;
}
function nowMs(): number {
  return Date.now();
}

// --- reader marks -----------------------------------------------------------

// The signed-in user's server-stored marks for a chapter (from the route
// loader's `library.chapterMarks` query), used as the SSR base in useChapterMarks.
export type ChapterMarks = {
  highlights: Record<string, HighlightColor>;
  notes: { verse: number; body: string }[];
};

// Reader marks for a chapter. The SERVER is the source of truth: `serverMarks`
// (prefetched in the loader) is the base, so a signed-in user's highlights/notes
// render in the SSR HTML and stay consistent across devices. The local-first
// store overlays it for optimistic writes + offline — local rows win over the
// server base (a just-made or offline edit shows immediately), and a local
// tombstone (deleted=true) removes the server row. Anonymous users have no
// serverMarks, so this is purely their local store.
//
// No hydration mismatch: the local collections read via useSyncExternalStore,
// whose server snapshot is empty, so the SSR and first (pre-hydration) client
// render both show `serverMarks` alone; the local overlay only applies once the
// client store is read after hydration.
export function useChapterMarks(
  book: string,
  chapter: number,
  serverMarks?: ChapterMarks,
) {
  const highlights = useCollectionRows<LocalHighlight>(
    collections().highlights,
    'lb-highlights',
  );
  const notes = useCollectionRows<LocalNote>(collections().notes, 'lb-notes');
  const usfm = usfmOf(book);
  return useMemo(() => {
    const hl: Record<string, string> = { ...(serverMarks?.highlights ?? {}) };
    const noted = new Set<number>(serverMarks?.notes.map((n) => n.verse) ?? []);
    for (const h of highlights) {
      if (h.book === usfm && h.chapter === chapter) {
        if (h.deleted) {
          delete hl[String(h.verse)];
        } else {
          hl[String(h.verse)] = h.color;
        }
      }
    }
    for (const n of notes) {
      if (n.book === usfm && n.chapter === chapter) {
        if (n.deleted) {
          noted.delete(n.verse);
        } else {
          noted.add(n.verse);
        }
      }
    }
    return { highlights: hl, notes: [...noted] };
  }, [highlights, notes, usfm, chapter, serverMarks]);
}

export function highlightOf(
  book: string,
  chapter: number,
  verse: number,
): string | null {
  return (
    collections().highlights.get(refOf(book, chapter, verse))?.color ?? null
  );
}

export function setHighlight(
  book: string,
  chapter: number,
  verse: number,
  color: HighlightColor,
): void {
  const c = collections().highlights;
  const ref = refOf(book, chapter, verse);
  const at = nowMs();
  if (c.has(ref)) {
    c.update(ref, (d) => {
      d.color = color;
      d.updatedAt = at;
      d.dirty = true;
      d.deleted = false;
    });
  } else {
    c.insert({
      ref,
      book: usfmOf(book),
      chapter,
      verse,
      color,
      updatedAt: at,
      dirty: true,
      deleted: false,
    } satisfies LocalHighlight);
  }
  scheduleSync();
}

export function removeHighlight(
  book: string,
  chapter: number,
  verse: number,
): void {
  const c = collections().highlights;
  const ref = refOf(book, chapter, verse);
  if (!c.has(ref)) {
    return;
  }
  c.update(ref, (d) => {
    d.deleted = true;
    d.dirty = true;
    d.updatedAt = nowMs();
  });
  scheduleSync();
}

// --- notes ------------------------------------------------------------------

export function noteOf(
  book: string,
  chapter: number,
  verse: number,
): string | null {
  const n = collections().notes.get(refOf(book, chapter, verse));
  return n && !n.deleted ? n.body : null;
}

export function setNote(
  book: string,
  chapter: number,
  verse: number,
  body: string,
): void {
  const c = collections().notes;
  const ref = refOf(book, chapter, verse);
  const at = nowMs();
  if (c.has(ref)) {
    c.update(ref, (d) => {
      d.body = body;
      d.updatedAt = at;
      d.dirty = true;
      d.deleted = false;
    });
  } else {
    c.insert({
      ref,
      book: usfmOf(book),
      chapter,
      verse,
      body,
      updatedAt: at,
      dirty: true,
      deleted: false,
    } satisfies LocalNote);
  }
  scheduleSync();
}

export function removeNote(book: string, chapter: number, verse: number): void {
  const c = collections().notes;
  const ref = refOf(book, chapter, verse);
  if (!c.has(ref)) {
    return;
  }
  c.update(ref, (d) => {
    d.deleted = true;
    d.dirty = true;
    d.updatedAt = nowMs();
  });
  scheduleSync();
}

// --- reading position -------------------------------------------------------

export function recordReading(
  book: string,
  chapter: number,
  verse?: number,
): void {
  const c = collections().progress;
  const key = `${usfmOf(book)}.${chapter}`;
  const at = nowMs();
  if (c.has(key)) {
    c.update(key, (d) => {
      d.verse = verse ?? null;
      d.updatedAt = at;
      d.dirty = true;
    });
  } else {
    c.insert({
      key,
      book: usfmOf(book),
      chapter,
      verse: verse ?? null,
      updatedAt: at,
      dirty: true,
    });
  }
  scheduleSync();
}

type ProgressView = {
  slug: string;
  name: string;
  chapter: number;
  verse: number | null;
  updatedAt: number;
};

function progressView(p: {
  book: string;
  chapter: number;
  verse: number | null;
  updatedAt: number;
}): ProgressView {
  const canon = findBook(p.book);
  return {
    slug: canon?.slug ?? p.book.toLowerCase(),
    name: canon?.name ?? p.book,
    chapter: p.chapter,
    verse: p.verse,
    updatedAt: p.updatedAt,
  };
}

export function useRecent(limit: number): ProgressView[] {
  const data = useCollectionRows<LocalProgress>(
    collections().progress,
    'lb-progress',
  );
  return useMemo(
    () =>
      [...data]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit)
        .map(progressView),
    [data, limit],
  );
}

export function useContinueReading(): ProgressView | null {
  const recent = useRecent(1);
  return recent[0] ?? null;
}

// --- library page -----------------------------------------------------------

export type HighlightView = LocalHighlight & { slug: string; name: string };
export type NoteView = LocalNote & { slug: string; name: string };

export function useAllHighlights(): HighlightView[] {
  const data = useCollectionRows<LocalHighlight>(
    collections().highlights,
    'lb-highlights',
  );
  return useMemo(
    () =>
      [...data]
        .filter((h) => !h.deleted)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((h) => {
          const canon = findBook(h.book);
          return {
            ...h,
            slug: canon?.slug ?? h.book.toLowerCase(),
            name: canon?.name ?? h.book,
          };
        }),
    [data],
  );
}

export function useAllNotes(): NoteView[] {
  const data = useCollectionRows<LocalNote>(collections().notes, 'lb-notes');
  return useMemo(
    () =>
      [...data]
        .filter((n) => !n.deleted)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((n) => {
          const canon = findBook(n.book);
          return {
            ...n,
            slug: canon?.slug ?? n.book.toLowerCase(),
            name: canon?.name ?? n.book,
          };
        }),
    [data],
  );
}
