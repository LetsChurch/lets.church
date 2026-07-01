// A minimal, dependency-free IndexedDB key→value store, used only for the large
// offline reading cache (cached chapters / downloaded translations) where
// localStorage's ~5 MB cap is too small. The small, reactive data (highlights,
// notes, reading position, preferences) lives in first-party TanStack DB
// localStorage collections instead — see collections.ts.
//
// Browser-only: every call no-ops / rejects gracefully when there's no
// IndexedDB (SSR), so callers can use it without extra guards.

const DB_NAME = 'lets-bible-cache';
const STORE = 'kv';

// Keys under this prefix are PUBLIC, rebuildable caches (not account data), so
// they survive `kvClear` on sign-out — dropping them would force a needless
// rebuild. The client-built FlexSearch index (search/index-cache.ts) uses it.
export const SEARCH_INDEX_PREFIX = 'flex-index:';

export function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error('IndexedDB not available'));
  }
  if (_dbPromise) {
    return _dbPromise;
  }
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      // Don't cache a rejected promise — allow a later retry.
      _dbPromise = null;
      reject(req.error);
    };
  });
  return _dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const t = database.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (!hasIndexedDb()) {
    return undefined;
  }
  return tx<T | undefined>(
    'readonly',
    (s) => s.get(key) as IDBRequest<T | undefined>,
  );
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (!hasIndexedDb()) {
    return;
  }
  await tx('readwrite', (s) => s.put(value as unknown as object, key));
}

export async function kvDelete(key: string): Promise<void> {
  if (!hasIndexedDb()) {
    return;
  }
  await tx('readwrite', (s) => s.delete(key));
}

// Wipe account-downloaded offline content on sign-out (cached chapters /
// downloaded translations / commentaries) so a previous account's content
// doesn't linger — preserving PUBLIC caches (SEARCH_INDEX_PREFIX), which aren't
// account data and would only have to be rebuilt.
export async function kvClear(): Promise<void> {
  if (!hasIndexedDb()) {
    return;
  }
  try {
    const keys = await kvKeys();
    await Promise.all(
      keys
        .filter((k) => !k.startsWith(SEARCH_INDEX_PREFIX))
        .map((k) => kvDelete(k)),
    );
  } catch {
    // best-effort wipe
  }
}

export async function kvKeys(prefix?: string): Promise<string[]> {
  if (!hasIndexedDb()) {
    return [];
  }
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  const strs = keys.map(String);
  return prefix ? strs.filter((k) => k.startsWith(prefix)) : strs;
}

export function now(): number {
  return Date.now();
}
