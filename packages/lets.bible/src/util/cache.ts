import type {
  TokenBucketOptions,
  TokenBucketResult,
} from '@letschurch/util/rate-limit';
import Redis from 'ioredis';

// Optional Valkey cache (mirrors packages/web/src/util/cache.ts). When
// VALKEY_URL is unset the cache is a no-op — reads miss, writes drop — so the
// app runs fine without Valkey (e.g. bare local dev).
const VALKEY_URL = process.env.VALKEY_URL;

// `undefined` = not yet initialized, `null` = disabled / failed to construct.
let client: Redis | null | undefined;

// Atomic token bucket: refill from Valkey's clock, spend only when enough
// tokens remain, and expire idle buckets once they would be full again.
const TOKEN_BUCKET_SCRIPT = `
local time = redis.call('TIME')
local now = (tonumber(time[1]) * 1000) + math.floor(tonumber(time[2]) / 1000)
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local values = redis.call('HMGET', KEYS[1], 'tokens', 'updated')
local tokens = tonumber(values[1]) or capacity
local updated = tonumber(values[2]) or now
local elapsed = math.max(0, now - updated)
tokens = math.min(capacity, tokens + ((elapsed / 1000) * refill))

local allowed = 0
local retry = 0
if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
else
  retry = math.ceil((cost - tokens) / refill)
end

redis.call('HSET', KEYS[1], 'tokens', tokens, 'updated', now)
redis.call('EXPIRE', KEYS[1], math.max(1, math.ceil(capacity / refill)))
return { allowed, tostring(tokens), retry }
`;

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

// A short startup grace period gives the shared bucket a chance to become
// authoritative without letting a Valkey outage hang requests.
async function waitForReady(c: Redis, timeoutMs = 150): Promise<boolean> {
  if (c.status === 'ready') return true;
  if (c.status === 'end') return false;

  const { promise, resolve } = Promise.withResolvers<boolean>();
  let settled = false;
  const finish = (ready: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    c.off('ready', onReady);
    c.off('end', onEnd);
    resolve(ready);
  };
  const onReady = () => finish(true);
  const onEnd = () => finish(false);
  const timer = setTimeout(() => finish(false), timeoutMs);
  c.once('ready', onReady);
  c.once('end', onEnd);
  return promise;
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

/**
 * Atomically consume a shared Valkey token bucket. Returns null when Valkey is
 * disabled or unavailable so callers can apply bounded process-memory fallback.
 */
export async function cacheConsumeTokenBucket({
  key,
  capacity,
  refillTokensPerSecond,
  cost,
}: TokenBucketOptions): Promise<TokenBucketResult | null> {
  const c = getClient();
  if (!c) return null;
  try {
    if (!(await waitForReady(c))) return null;
    const raw = await c.eval(
      TOKEN_BUCKET_SCRIPT,
      1,
      key,
      capacity,
      refillTokensPerSecond,
      cost,
    );
    if (!Array.isArray(raw) || raw.length !== 3) return null;
    const allowed = Number(raw[0]) === 1;
    const remainingTokens = Number(raw[1]);
    const retryAfterSeconds = Number(raw[2]);
    if (
      !Number.isFinite(remainingTokens) ||
      !Number.isFinite(retryAfterSeconds)
    ) {
      return null;
    }
    return {
      allowed,
      remainingTokens: Math.max(0, remainingTokens),
      retryAfterSeconds: Math.max(0, Math.ceil(retryAfterSeconds)),
    };
  } catch {
    return null;
  }
}
