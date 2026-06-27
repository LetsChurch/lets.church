// Ephemeral, session-scoped UI state for the study panel — which tab is active
// and which commentary work the reader is following. Kept in module scope (not
// React state, not persisted storage) so it survives the panel closing/reopening
// and moving between verses/chapters within the page session: clicking from one
// verse to the next keeps you on the Commentaries tab, reading the same work.
//
// Reads use `useSyncExternalStore` so they're SSR-safe (server snapshot = the
// defaults) and update every subscriber when the value changes — mirroring the
// pattern in `src/local/store.ts`.

import { useSyncExternalStore } from 'react';

export type StudyTab = 'verse' | 'commentaries';

let activeTab: StudyTab = 'verse';
let commentaryWorkId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) {
    cb();
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function setStudyTab(tab: StudyTab) {
  if (tab === activeTab) return;
  activeTab = tab;
  emit();
}

export function setCommentaryWork(id: string | null) {
  if (id === commentaryWorkId) return;
  commentaryWorkId = id;
  emit();
}

export function useStudyTab(): StudyTab {
  return useSyncExternalStore(
    subscribe,
    () => activeTab,
    () => 'verse' as const,
  );
}

export function useCommentaryWork(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => commentaryWorkId,
    () => null,
  );
}
