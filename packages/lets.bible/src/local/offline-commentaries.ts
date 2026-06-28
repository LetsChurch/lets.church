// Offline commentaries: download a commentator's full text to IndexedDB and let
// the study panel fall back to it when the network is unavailable.
//
// The online path is unchanged — the panel still fetches from the server. These
// query-option wrappers mirror `crossRefsQueryOptions` (bible.$book.$chapter):
// reuse the tRPC queryKey, and on a failed call assemble the result from the
// downloaded copy (downloaded works only). Download state is a module-level
// `useSyncExternalStore` store (SSR snapshot = empty), like lib/study-session.ts.

import { useSyncExternalStore } from 'react';
import { usfmOf } from '@/local/store';
import { trpcClient, type useTRPC } from '@/trpc/react';
import { kvDelete, kvGet, kvKeys, kvSet, now } from './db';

type Trpc = ReturnType<typeof useTRPC>;

export type OfflineWork = {
  id: string;
  name: string;
  author: string;
  year: string | null;
  tradition: string | null;
  sourceUrl: string | null;
};
type OfflineEntry = {
  chapter: number;
  verse: number;
  verseEnd: number | null;
  body: string;
};
type OfflineMeta = Record<
  string,
  { bytes: number; entryCount: number; books: string[]; downloadedAt: number }
>;
// The server shape the panel consumes (must match verseCommentaries output).
type VerseCommentary = {
  workId: string;
  workName: string;
  author: string;
  year: string | null;
  tradition: string | null;
  sourceUrl: string | null;
  verse: number;
  verseEnd: number | null;
  body: string;
};

export type WorkStatus = {
  state: 'idle' | 'downloading' | 'downloaded';
  progress?: number;
};

const WORKS_KEY = 'commentary:works';
const META_KEY = 'commentary:meta';
const bookKey = (workId: string, usfm: string) =>
  `commentary:${workId}:${usfm}`;

// --- module store (SSR snapshot is a stable empty object) -------------------
const EMPTY: Record<string, WorkStatus> = {};
let statuses: Record<string, WorkStatus> = EMPTY;
let hydrated = false;
const cancelled = new Set<string>(); // workIds whose in-flight download to abort
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}
function setStatus(id: string, s: WorkStatus) {
  statuses = { ...statuses, [id]: s };
  emit();
}

async function hydrate() {
  const meta = (await kvGet<OfflineMeta>(META_KEY)) ?? {};
  const next: Record<string, WorkStatus> = {};
  for (const id of Object.keys(meta)) next[id] = { state: 'downloaded' };
  statuses = next;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!hydrated) {
    hydrated = true;
    void hydrate();
  }
  return () => {
    listeners.delete(cb);
  };
}

export function useOfflineCommentaries(): Record<string, WorkStatus> {
  return useSyncExternalStore(
    subscribe,
    () => statuses,
    () => EMPTY,
  );
}

// --- download / remove ------------------------------------------------------

export async function downloadWork(workId: string): Promise<void> {
  cancelled.delete(workId);
  setStatus(workId, { state: 'downloading', progress: 0 });
  try {
    // Refresh the shared works-metadata blob (the join source for offline reads).
    const works = await trpcClient.bible.commentaryWorks.query();
    await kvSet(WORKS_KEY, works);

    const books = await trpcClient.bible.commentaryWorkBooks.query({ workId });
    let bytes = 0;
    let entryCount = 0;
    const written: string[] = [];
    for (let i = 0; i < books.length; i++) {
      if (cancelled.has(workId)) throw new Error('cancelled');
      const book = books[i].book;
      const entries = await trpcClient.bible.commentaryWorkBook.query({
        workId,
        book,
      });
      await kvSet(bookKey(workId, book), entries);
      written.push(book);
      entryCount += entries.length;
      for (const e of entries) bytes += e.body.length;
      setStatus(workId, {
        state: 'downloading',
        progress: (i + 1) / books.length,
      });
    }

    const meta = (await kvGet<OfflineMeta>(META_KEY)) ?? {};
    meta[workId] = { bytes, entryCount, books: written, downloadedAt: now() };
    await kvSet(META_KEY, meta);
    setStatus(workId, { state: 'downloaded' });
  } catch {
    // Partial/failed download (incl. user cancel) — clean up, back to idle.
    await removeWork(workId);
  }
}

export async function removeWork(workId: string): Promise<void> {
  cancelled.add(workId); // aborts an in-flight download loop between books
  for (const k of await kvKeys(`commentary:${workId}:`)) {
    await kvDelete(k);
  }
  const meta = (await kvGet<OfflineMeta>(META_KEY)) ?? {};
  delete meta[workId];
  await kvSet(META_KEY, meta);
  if (Object.keys(meta).length === 0) {
    await kvDelete(WORKS_KEY);
  }
  setStatus(workId, { state: 'idle' });
}

// --- offline-fallback query options (used by the study panel) ---------------

// Works list: online = all works (server); offline = only downloaded works.
export function commentaryWorksQueryOptions(trpc: Trpc) {
  const opts = trpc.bible.commentaryWorks.queryOptions();
  return {
    queryKey: opts.queryKey,
    queryFn: async (): Promise<OfflineWork[]> => {
      try {
        return await trpcClient.bible.commentaryWorks.query();
      } catch {
        const [works, meta] = await Promise.all([
          kvGet<OfflineWork[]>(WORKS_KEY),
          kvGet<OfflineMeta>(META_KEY),
        ]);
        if (!works || !meta) return [];
        return works.filter((w) => meta[w.id]); // already ordinal-ordered
      }
    },
  };
}

// Verse commentaries: online = server; offline = assembled from downloaded works
// (same shape as the server, ordered by work ordinal).
export function verseCommentariesQueryOptions(
  trpc: Trpc,
  params: { book: string; chapter: number; verse: number },
) {
  const opts = trpc.bible.verseCommentaries.queryOptions(params);
  return {
    queryKey: opts.queryKey,
    queryFn: async (): Promise<VerseCommentary[]> => {
      try {
        return await trpcClient.bible.verseCommentaries.query(params);
      } catch {
        return assembleOffline(params);
      }
    },
  };
}

async function assembleOffline({
  book,
  chapter,
  verse,
}: {
  book: string;
  chapter: number;
  verse: number;
}): Promise<VerseCommentary[]> {
  const usfm = usfmOf(book);
  const [works, meta] = await Promise.all([
    kvGet<OfflineWork[]>(WORKS_KEY),
    kvGet<OfflineMeta>(META_KEY),
  ]);
  if (!works || !meta) return [];
  const out: VerseCommentary[] = [];
  for (const w of works) {
    if (!meta[w.id]) continue;
    const entries = (await kvGet<OfflineEntry[]>(bookKey(w.id, usfm))) ?? [];
    const hit = entries.find(
      (e) =>
        e.chapter === chapter &&
        (e.verse === verse ||
          (e.verse <= verse && e.verseEnd != null && e.verseEnd >= verse)),
    );
    if (hit) {
      out.push({
        workId: w.id,
        workName: w.name,
        author: w.author,
        year: w.year,
        tradition: w.tradition,
        sourceUrl: w.sourceUrl,
        verse: hit.verse,
        verseEnd: hit.verseEnd,
        body: hit.body,
      });
    }
  }
  return out;
}
