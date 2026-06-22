import { bookBySlug } from '@/lib/canon';
import { trpcClient } from '@/trpc/react';
import { collections } from './collections';
import { kvClear } from './db';
import type {
  HighlightColor,
  LocalHighlight,
  LocalNote,
  LocalProgress,
} from './types';

// Server sync for the local-first collections. Local is the working copy; this
// pushes dirty rows to the server (tRPC) and pulls server rows back, both gated
// on being online + signed in. Last-writer-wins by `updatedAt`. Anonymous users
// never sync — their data stays local until they sign in (see `mergeOnSignIn`).

let signedIn = false;
export function setSyncSignedIn(value: boolean): void {
  signedIn = value;
}

function canSync(): boolean {
  return (
    signedIn && typeof navigator !== 'undefined' && navigator.onLine !== false
  );
}

let timer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;

// Debounced push (called after every local write).
export function scheduleSync(): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    void pushDirty();
  }, 400);
}

// Push every dirty row to the server, then clear the flag / prune tombstones.
export async function pushDirty(): Promise<void> {
  if (!canSync() || syncing) {
    return;
  }
  syncing = true;
  try {
    const hl = collections().highlights;
    // Snapshot before iterating — the loop deletes/updates rows, and mutating a
    // live collection iterator can skip entries (matches clearLocalData/merge).
    for (const h of [...hl.values()]) {
      if (!h.dirty) {
        continue;
      }
      try {
        if (h.deleted) {
          await trpcClient.library.removeHighlight.mutate({
            book: h.book,
            chapter: h.chapter,
            verse: h.verse,
          });
          hl.delete(h.ref);
        } else {
          await trpcClient.library.setHighlight.mutate({
            book: h.book,
            chapter: h.chapter,
            verse: h.verse,
            color: h.color,
          });
          hl.update(h.ref, (d) => {
            d.dirty = false;
          });
        }
      } catch {
        // leave dirty; retried on next sync
      }
    }

    const nt = collections().notes;
    for (const n of [...nt.values()]) {
      if (!n.dirty) {
        continue;
      }
      try {
        if (n.deleted) {
          await trpcClient.library.removeNote.mutate({
            book: n.book,
            chapter: n.chapter,
            verse: n.verse,
          });
          nt.delete(n.ref);
        } else {
          await trpcClient.library.setNote.mutate({
            book: n.book,
            chapter: n.chapter,
            verse: n.verse,
            body: n.body,
          });
          nt.update(n.ref, (d) => {
            d.dirty = false;
          });
        }
      } catch {
        // retry next sync
      }
    }

    const pr = collections().progress;
    for (const p of [...pr.values()]) {
      if (!p.dirty) {
        continue;
      }
      try {
        await trpcClient.library.recordReading.mutate({
          book: p.book,
          chapter: p.chapter,
          verse: p.verse ?? undefined,
        });
        pr.update(p.key, (d) => {
          d.dirty = false;
        });
      } catch {
        // retry next sync
      }
    }
  } finally {
    syncing = false;
  }
}

// Pull server rows into local, keeping the newer copy and never clobbering a
// dirty (unpushed) local edit.
export async function pullServer(): Promise<void> {
  if (!canSync()) {
    return;
  }
  const [serverHl, serverNotes, serverRecent] = await Promise.all([
    trpcClient.library.highlights.query(),
    trpcClient.library.notes.query(),
    trpcClient.library.recent.query({ limit: 50 }),
  ]);

  const hl = collections().highlights;
  for (const s of serverHl) {
    const ref = `${s.book}.${s.chapter}.${s.verse}`;
    const local = hl.get(ref);
    if (local?.dirty) {
      continue;
    }
    const row: LocalHighlight = {
      ref,
      book: s.book,
      chapter: s.chapter,
      verse: s.verse,
      color: s.color as HighlightColor,
      updatedAt: new Date(s.createdAt).getTime(),
      dirty: false,
      deleted: false,
    };
    if (local) {
      hl.update(ref, (d) => Object.assign(d, row));
    } else {
      hl.insert(row);
    }
  }

  const nt = collections().notes;
  for (const s of serverNotes) {
    const ref = `${s.book}.${s.chapter}.${s.verse}`;
    const local = nt.get(ref);
    if (local?.dirty) {
      continue;
    }
    const row: LocalNote = {
      ref,
      book: s.book,
      chapter: s.chapter,
      verse: s.verse,
      body: s.body,
      updatedAt: new Date(s.updatedAt).getTime(),
      dirty: false,
      deleted: false,
    };
    if (local) {
      nt.update(ref, (d) => Object.assign(d, row));
    } else {
      nt.insert(row);
    }
  }

  const pr = collections().progress;
  for (const s of serverRecent) {
    const book = bookBySlug(s.slug)?.code ?? s.slug.toUpperCase();
    const key = `${book}.${s.chapter}`;
    if (pr.get(key)?.dirty) {
      continue;
    }
    const row: LocalProgress = {
      key,
      book,
      chapter: s.chapter,
      verse: s.verse,
      updatedAt: new Date(s.updatedAt).getTime(),
      dirty: false,
    };
    if (pr.has(key)) {
      pr.update(key, (d) => Object.assign(d, row));
    } else {
      pr.insert(row);
    }
  }
}

// Whether there is any local data (used to decide if a sign-in merge prompt is
// warranted). Reads localStorage DIRECTLY (synchronously) rather than the
// collection's in-memory size, because the collections hydrate asynchronously —
// at sign-in time the collection may still be empty while the data is sitting in
// localStorage. The localStorage shape is { "s:<key>": { data: {...} } }.
function countLive(storageKey: string): number {
  if (typeof window === 'undefined') {
    return 0;
  }
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return 0;
    }
    const parsed = JSON.parse(raw) as Record<
      string,
      { data?: { deleted?: boolean } }
    >;
    return Object.values(parsed).filter((e) => !e.data?.deleted).length;
  } catch {
    return 0;
  }
}

export function hasLocalData(): boolean {
  return (
    countLive('lb-highlights') > 0 ||
    countLive('lb-notes') > 0 ||
    countLive('lb-progress') > 0
  );
}

export function localDataCounts(): {
  highlights: number;
  notes: number;
  progress: number;
} {
  return {
    highlights: countLive('lb-highlights'),
    notes: countLive('lb-notes'),
    progress: countLive('lb-progress'),
  };
}

// Wipe ALL on-device data — called on sign-out so the account's library can't
// leak to the next (anonymous) user on a shared device. Clears the reactive
// collections (in-memory + their localStorage), the cached translations list,
// and the IndexedDB offline reading cache. (The sign-in merge flag is cleared by
// the caller.)
export function clearLocalData(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const c = collections();
  for (const h of [...c.highlights.values()]) {
    c.highlights.delete(h.ref);
  }
  for (const n of [...c.notes.values()]) {
    c.notes.delete(n.ref);
  }
  for (const p of [...c.progress.values()]) {
    c.progress.delete(p.key);
  }
  // Belt-and-suspenders: drop the persisted keys directly too, in case the
  // collections hadn't finished hydrating from localStorage yet.
  try {
    localStorage.removeItem('lb-highlights');
    localStorage.removeItem('lb-notes');
    localStorage.removeItem('lb-progress');
    localStorage.removeItem('lb-translations');
  } catch {
    // ignore storage errors
  }
  void kvClear();
}

// On sign-in with local data present: "merge" marks all local rows dirty and
// pushes them (union with server), then pulls. "replace" wipes server-only data
// by pushing local as authoritative (same as merge for our additive model).
// "discard" drops local and takes the server copy.
export async function mergeOnSignIn(mode: 'merge' | 'discard'): Promise<void> {
  const c = collections();
  if (mode === 'discard') {
    for (const h of [...c.highlights.values()]) {
      c.highlights.delete(h.ref);
    }
    for (const n of [...c.notes.values()]) {
      c.notes.delete(n.ref);
    }
    for (const p of [...c.progress.values()]) {
      c.progress.delete(p.key);
    }
    await pullServer();
    return;
  }
  // merge: mark everything dirty so pushDirty sends it, then reconcile.
  for (const h of c.highlights.values()) {
    c.highlights.update(h.ref, (d) => {
      d.dirty = true;
    });
  }
  for (const n of c.notes.values()) {
    c.notes.update(n.ref, (d) => {
      d.dirty = true;
    });
  }
  for (const p of c.progress.values()) {
    c.progress.update(p.key, (d) => {
      d.dirty = true;
    });
  }
  await pushDirty();
  await pullServer();
}
