import {
  createCollection,
  localOnlyCollectionOptions,
  localStorageCollectionOptions,
} from '@tanstack/react-db';

import type { LocalHighlight, LocalNote, LocalProgress } from './types';

// First-party TanStack DB collections — the reactive, local-first source of
// truth the UI reads via `useLiveQuery`. In the browser they persist to
// localStorage (the canonical TanStack persistence adapter: survives reloads,
// syncs across tabs, works offline). During SSR there's no localStorage, so we
// build empty in-memory (`localOnly`) stubs of the same shape — this keeps the
// live-query hooks isomorphic (they render empty on the server and the first
// client paint, then fill in once localStorage loads, so there's no hydration
// mismatch). The data here is small (highlights / notes / reading position);
// large offline data (cached chapters) uses raw IndexedDB in db.ts.

const isBrowser = typeof window !== 'undefined';

function build() {
  if (!isBrowser) {
    return {
      highlights: createCollection(
        localOnlyCollectionOptions({
          id: 'lb-highlights',
          getKey: (h: LocalHighlight) => h.ref,
        }),
      ),
      notes: createCollection(
        localOnlyCollectionOptions({
          id: 'lb-notes',
          getKey: (n: LocalNote) => n.ref,
        }),
      ),
      progress: createCollection(
        localOnlyCollectionOptions({
          id: 'lb-progress',
          getKey: (p: LocalProgress) => p.key,
        }),
      ),
    };
  }
  return {
    highlights: createCollection(
      localStorageCollectionOptions({
        id: 'lb-highlights',
        storageKey: 'lb-highlights',
        getKey: (h: LocalHighlight) => h.ref,
      }),
    ),
    notes: createCollection(
      localStorageCollectionOptions({
        id: 'lb-notes',
        storageKey: 'lb-notes',
        getKey: (n: LocalNote) => n.ref,
      }),
    ),
    progress: createCollection(
      localStorageCollectionOptions({
        id: 'lb-progress',
        storageKey: 'lb-progress',
        getKey: (p: LocalProgress) => p.key,
      }),
    ),
  };
}

let _collections: ReturnType<typeof build> | null = null;

export function collections(): ReturnType<typeof build> {
  if (!_collections) {
    _collections = build();
  }
  return _collections;
}
