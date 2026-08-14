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
let activePush: Promise<void> | null = null;
let rerunRequested = false;

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

function sameHighlight(
  current: LocalHighlight | undefined,
  sent: LocalHighlight,
): boolean {
  return (
    current?.dirty === true &&
    current.ref === sent.ref &&
    current.book === sent.book &&
    current.chapter === sent.chapter &&
    current.verse === sent.verse &&
    current.color === sent.color &&
    current.updatedAt === sent.updatedAt &&
    current.deleted === sent.deleted
  );
}

function sameNote(current: LocalNote | undefined, sent: LocalNote): boolean {
  return (
    current?.dirty === true &&
    current.ref === sent.ref &&
    current.book === sent.book &&
    current.chapter === sent.chapter &&
    current.verse === sent.verse &&
    current.body === sent.body &&
    current.updatedAt === sent.updatedAt &&
    current.deleted === sent.deleted
  );
}

function sameProgress(
  current: LocalProgress | undefined,
  sent: LocalProgress,
): boolean {
  return (
    current?.dirty === true &&
    current.key === sent.key &&
    current.book === sent.book &&
    current.chapter === sent.chapter &&
    current.verse === sent.verse &&
    current.updatedAt === sent.updatedAt
  );
}

async function pushPass(): Promise<void> {
  const hl = collections().highlights;
  // Snapshot before iterating — the loop deletes/updates rows, and mutating a
  // live collection iterator can skip entries (matches clearLocalData/merge).
  for (const row of [...hl.values()]) {
    if (!row.dirty) {
      continue;
    }
    const sent = { ...row };
    try {
      const result = sent.deleted
        ? await trpcClient.library.removeHighlight.mutate({
            book: sent.book,
            chapter: sent.chapter,
            verse: sent.verse,
          })
        : await trpcClient.library.setHighlight.mutate({
            book: sent.book,
            chapter: sent.chapter,
            verse: sent.verse,
            color: sent.color,
          });
      const current = hl.get(sent.ref);
      if (!sameHighlight(current, sent)) {
        if (current?.dirty) rerunRequested = true;
        continue;
      }
      hl.update(sent.ref, (draft) => {
        draft.updatedAt = result.updatedAt.getTime();
        draft.dirty = false;
      });
    } catch {
      // Leave dirty; a later requested sync retries network failures.
    }
  }

  const nt = collections().notes;
  for (const row of [...nt.values()]) {
    if (!row.dirty) {
      continue;
    }
    const sent = { ...row };
    try {
      const result = sent.deleted
        ? await trpcClient.library.removeNote.mutate({
            book: sent.book,
            chapter: sent.chapter,
            verse: sent.verse,
          })
        : await trpcClient.library.setNote.mutate({
            book: sent.book,
            chapter: sent.chapter,
            verse: sent.verse,
            body: sent.body,
          });
      const current = nt.get(sent.ref);
      if (!sameNote(current, sent)) {
        if (current?.dirty) rerunRequested = true;
        continue;
      }
      nt.update(sent.ref, (draft) => {
        draft.updatedAt = result.updatedAt.getTime();
        draft.dirty = false;
      });
    } catch {
      // Leave dirty; a later requested sync retries network failures.
    }
  }

  const pr = collections().progress;
  for (const row of [...pr.values()]) {
    if (!row.dirty) {
      continue;
    }
    const sent = { ...row };
    try {
      const result = await trpcClient.library.recordReading.mutate({
        book: sent.book,
        chapter: sent.chapter,
        verse: sent.verse ?? undefined,
      });
      const current = pr.get(sent.key);
      if (!sameProgress(current, sent)) {
        if (current?.dirty) rerunRequested = true;
        continue;
      }
      if (result.ok && result.updatedAt) {
        pr.update(sent.key, (draft) => {
          draft.updatedAt = result.updatedAt.getTime();
          draft.dirty = false;
        });
      }
    } catch {
      // Leave dirty; a later requested sync retries network failures.
    }
  }
}

async function drainDirty(): Promise<void> {
  do {
    rerunRequested = false;
    await pushPass();
  } while (canSync() && rerunRequested);
}

// Push every dirty row. Re-entry joins the active run and requests one more
// pass, so writes made while a mutation is in flight cannot be stranded.
export function pushDirty(): Promise<void> {
  if (!canSync()) {
    return Promise.resolve();
  }
  if (activePush) {
    rerunRequested = true;
    return activePush;
  }
  const running = drainDirty();
  activePush = running;
  return running.finally(() => {
    if (activePush === running) activePush = null;
  });
}

// Pull compact server mark state into local, keeping newer clean copies and
// never clobbering a dirty (unpushed) local edit.
export async function pullServer(): Promise<void> {
  if (!canSync()) {
    return;
  }
  const [serverMarks, serverRecent] = await Promise.all([
    trpcClient.library.sync.query(),
    trpcClient.library.recent.query({ limit: 50 }),
  ]);

  const hl = collections().highlights;
  for (const server of serverMarks.highlights) {
    const local = hl.get(server.ref);
    if (local?.dirty) {
      continue;
    }
    const updatedAt = server.updatedAt.getTime();
    if (local && local.updatedAt > updatedAt) {
      continue;
    }
    const row: LocalHighlight = {
      ref: server.ref,
      book: server.book,
      chapter: server.chapter,
      verse: server.verse,
      color: server.color as HighlightColor,
      updatedAt,
      dirty: false,
      deleted: server.deletedAt !== null,
    };
    if (local) {
      hl.update(server.ref, (draft) => Object.assign(draft, row));
    } else {
      hl.insert(row);
    }
  }

  const nt = collections().notes;
  for (const server of serverMarks.notes) {
    const local = nt.get(server.ref);
    if (local?.dirty) {
      continue;
    }
    const updatedAt = server.updatedAt.getTime();
    if (local && local.updatedAt > updatedAt) {
      continue;
    }
    const row: LocalNote = {
      ref: server.ref,
      book: server.book,
      chapter: server.chapter,
      verse: server.verse,
      body: server.body,
      updatedAt,
      dirty: false,
      deleted: server.deletedAt !== null,
    };
    if (local) {
      nt.update(server.ref, (draft) => Object.assign(draft, row));
    } else {
      nt.insert(row);
    }
  }

  const pr = collections().progress;
  for (const server of serverRecent) {
    const book = bookBySlug(server.slug)?.code ?? server.slug.toUpperCase();
    const key = `${book}.${server.chapter}`;
    if (pr.get(key)?.dirty) {
      continue;
    }
    const row: LocalProgress = {
      key,
      book,
      chapter: server.chapter,
      verse: server.verse,
      updatedAt: server.updatedAt.getTime(),
      dirty: false,
    };
    if (pr.has(key)) {
      pr.update(key, (draft) => Object.assign(draft, row));
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
  // The localStorage-backed collections hydrate asynchronously, so at sign-in
  // they may still be empty in memory while the user's anonymous rows sit in
  // localStorage (hasLocalData reads localStorage directly, which is why the
  // prompt fires). Wait for hydration before reading them — otherwise merge
  // would push nothing (silently losing local highlights/notes) and discard
  // would delete nothing (leaving them to resurface), yet lb-merged would be set
  // and the prompt suppressed.
  await Promise.all([
    c.highlights.preload(),
    c.notes.preload(),
    c.progress.preload(),
  ]);
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
