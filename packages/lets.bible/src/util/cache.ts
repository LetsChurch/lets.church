import Redis from 'ioredis';

// Optional Valkey cache (mirrors packages/web/src/util/cache.ts). When
// VALKEY_URL is unset the cache is a no-op — reads miss, writes drop — so the
// app runs fine without Valkey (e.g. bare local dev).
const VALKEY_URL = process.env.VALKEY_URL;

// `undefined` = not yet initialized, `null` = disabled / failed to construct.
let client: Redis | null | undefined;

function getClient(): Redis | null {
  if (client !== undefined) return client;
  if (!VALKEY_URL) {
    client = null;
    return null;
  }
  try {
    client = new Redis(VALKEY_URL, {
      // Best-effort cache: fail fast and never queue commands while offline so a
      // Valkey outage degrades to "no cache" instead of hanging requests.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    client.on('error', (err) => {
      console.warn(
        'Valkey connection error (cache degraded):',
        err instanceof Error ? err.message : String(err),
      );
    });
  } catch (err) {
    console.warn(
      'Failed to construct Valkey client; cache disabled:',
      err instanceof Error ? err.message : String(err),
    );
    client = null;
  }
  return client;
}

/** Read a string value. Returns null on miss, disabled cache, or any error. */
export async function cacheGet(key: string): Promise<string | null> {
  const c = getClient();
  if (!c) return null;
  try {
    return await c.get(key);
  } catch {
    return null;
  }
}

/** Write a string value with a TTL (seconds). No-op on disabled cache or error. */
export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.set(key, value, 'EX', ttlSeconds);
  } catch {
    // Best-effort: a failed cache write must not fail the request.
  }
}
