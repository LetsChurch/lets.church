// Cache of the client-built FlexSearch index shards, layered over the app's one
// IndexedDB abstraction (local/db.ts's kv store) — the same store the offline
// chapter / commentary caches use, so all large offline blobs go through one
// place rather than a second hand-rolled IndexedDB. (TanStack DB is the app's
// other persistence layer, but it's localStorage-backed — synchronous, ~5 MB cap
// — so it can't hold the ~11 MB index; see local/collections.ts.)
//
// Keyed `flex-index:<id>`; the stored `version` (a config tag + a hash of the
// verses.json it was built from) is checked on read, so a corpus or config
// change misses and rebuilds. These entries survive sign-out (public,
// rebuildable — see db.ts kvClear / SEARCH_INDEX_PREFIX). Best-effort: db.ts
// no-ops without IndexedDB (SSR) and swallows errors, so a miss just rebuilds.
import { kvGet, kvSet, SEARCH_INDEX_PREFIX } from '@/local/db';

type Entry = { version: string; parts: Record<string, string> };

const keyFor = (id: string) => `${SEARCH_INDEX_PREFIX}${id}`;

/** Read the cached export shards for `id` iff they were built at `version`. */
export async function getCachedIndex(
  id: string,
  version: string,
): Promise<Record<string, string> | null> {
  const entry = await kvGet<Entry>(keyFor(id));
  return entry && entry.version === version ? entry.parts : null;
}

/** Store the export shards for `id`, overwriting any stale version (one per id). */
export async function putCachedIndex(
  id: string,
  version: string,
  parts: Record<string, string>,
): Promise<void> {
  await kvSet<Entry>(keyFor(id), { version, parts });
}

// Fast, stable 53-bit string hash (cyrb53) for the cache version — detects any
// change to the verses.json the index was built from. ~a few ms over ~4 MB.
export function hashString(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
