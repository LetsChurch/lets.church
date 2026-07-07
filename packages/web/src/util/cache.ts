import Redis from 'ioredis';
import { z } from 'zod';

import logger from './logger';

const moduleLogger = logger.child({ module: 'util/cache' });

// Optional: when unset the cache is a no-op (every read misses, writes are
// dropped) so the app still works without Valkey running.
const { VALKEY_URL } = z
  .object({ VALKEY_URL: z.string().optional() })
  .parse(process.env);

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
    // Swallow connection errors (logged once) so they don't crash the process.
    client.on('error', (err) => {
      moduleLogger.warn(
        {
          context: { error: err instanceof Error ? err.message : String(err) },
        },
        'Valkey connection error (cache degraded)',
      );
    });
  } catch (err) {
    moduleLogger.warn(
      { context: { error: err instanceof Error ? err.message : String(err) } },
      'Failed to construct Valkey client; cache disabled',
    );
    client = null;
  }
  return client;
}

/** Read+parse a JSON value. Returns null on miss, disabled cache, or any error. */
export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const raw = await c.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Write a JSON value with a TTL (seconds). No-op on disabled cache or error. */
export async function cacheSetJson(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Best-effort: a failed cache write must not fail the request.
  }
}

/**
 * Delete every key matching `${prefix}*` and return how many were removed.
 * Uses SCAN (non-blocking) + UNLINK (async free). Returns 0 on disabled cache;
 * surfaces errors to the caller so an admin "clear cache" action can report them.
 */
export async function clearByPrefix(prefix: string): Promise<number> {
  const c = getClient();
  if (!c) return 0;
  let cleared = 0;
  let cursor = '0';
  do {
    const [next, keys] = await c.scan(
      cursor,
      'MATCH',
      `${prefix}*`,
      'COUNT',
      500,
    );
    cursor = next;
    if (keys.length > 0) cleared += await c.unlink(...keys);
  } while (cursor !== '0');
  return cleared;
}
