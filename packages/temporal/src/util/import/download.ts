import { createWriteStream } from 'node:fs';
import { stat, truncate } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';

import type { Logger } from '@letschurch/util';
import { Context } from '@temporalio/activity';
import { noop } from 'es-toolkit';
import { nanoid } from 'nanoid';

import { safeFetch, UnsafeUrlError } from './safe-url';
import { USER_AGENT } from './user-agent';

// Cap a single import download so a malicious or broken source can't exhaust
// worker disk. Generous by default; override per-deployment if needed.
const MAX_DOWNLOAD_BYTES = Number(
  process.env.IMPORT_MAX_DOWNLOAD_BYTES ?? 32 * 1024 * 1024 * 1024,
);

// Media can legitimately take hours to download, so the overall limit is long
// (callers fetching small things, like thumbnails, pass a short one) and a
// separate stall timeout aborts a connection that stops sending bytes.
const DEFAULT_MAX_DURATION_MS = 6 * 60 * 60 * 1000;
// Options for thumbnails and other small, optional downloads: a short overall
// limit and an artwork-sized byte cap.
export const THUMBNAIL_DOWNLOAD = {
  maxBytes: 25 * 1024 * 1024,
  maxDurationMs: 60_000,
} as const;
const STALL_TIMEOUT_MS = 60_000;
// Consecutive reconnects that make no progress before giving up.
const MAX_RESUMES_WITHOUT_PROGRESS = 5;

class DownloadError extends Error {
  constructor(
    message: string,
    readonly resumable: boolean,
  ) {
    super(message);
  }
}

/** Start offset of a `Content-Range: bytes <start>-<end>/<total>` header. */
function contentRangeStart(res: Response) {
  const match = /^bytes (\d+)-/.exec(res.headers.get('content-range') ?? '');
  return match ? Number(match[1]) : null;
}

/** Full size of the resource, if the response says (in bytes on disk). */
function totalSize(res: Response) {
  const range = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
  if (range) return Number(range[1]);
  // A compressed body is decoded by fetch, so its Content-Length isn't the
  // size on disk. (We ask for identity encoding, but don't trust it.)
  const encoding = res.headers.get('content-encoding');
  if (encoding && encoding !== 'identity') return null;
  const length = Number(res.headers.get('content-length'));
  return res.status === 200 && Number.isFinite(length) && length > 0
    ? length
    : null;
}

async function sizeOnDisk(path: string) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

// Local filesystem failures: reconnecting to the origin won't fix these.
const LOCAL_ERROR_CODES = new Set([
  'ENOSPC',
  'EDQUOT',
  'EACCES',
  'EPERM',
  'EROFS',
  'EMFILE',
  'ENFILE',
]);

/** The calling activity's cancellation signal, if running in one. */
function activityCancellation(): AbortSignal | undefined {
  try {
    return Context.current().cancellationSignal;
  } catch {
    return undefined;
  }
}

/** Server errors and rate limits are worth reconnecting for; 4xx isn't. */
function isTransientStatus(status: number) {
  return status === 429 || status >= 500;
}

/**
 * Download a URL to a file in `dir`. If the connection drops mid-download
 * (CDNs do close long transfers), it reconnects and resumes from the bytes
 * already on disk with a Range request (guarded by If-Range, so a file that
 * changed meanwhile restarts instead of being spliced), falling back to a
 * full restart when the server ignores or mangles Range.
 */
export async function downloadUrl(
  input: URL | string,
  dir: string,
  log: Logger,
  heartbeat: (s: string) => unknown = noop,
  {
    maxBytes = MAX_DOWNLOAD_BYTES,
    maxDurationMs = DEFAULT_MAX_DURATION_MS,
  }: { maxBytes?: number; maxDurationMs?: number } = {},
): Promise<string> {
  log.info(`Downloading URL ${String(input)}`);

  const deadline = Date.now() + maxDurationMs;
  let dest: string | null = null;
  let url = String(input);
  let total: number | null = null;
  // Validator for If-Range, from the response that started the file.
  let validator: string | null = null;
  let resumesWithoutProgress = 0;

  const cancelled = activityCancellation();

  for (;;) {
    // A cancelled activity (e.g. its upload was deleted) stops reconnecting.
    cancelled?.throwIfAborted();
    let offset = dest ? await sizeOnDisk(dest) : 0;
    if (total !== null && offset >= total) break;
    if (dest && offset > 0 && validator === null && total === null) {
      // Nothing to tell whether the file changed since: a resume could splice
      // two versions together, so start over.
      await truncate(dest, 0);
      offset = 0;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new DownloadError(
        `Download of ${url} did not finish within ${maxDurationMs}ms`,
        false,
      );
    }

    const stall = new AbortController();
    let stallTimer = setTimeout(() => stall.abort(), STALL_TIMEOUT_MS);
    const resetStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => stall.abort(), STALL_TIMEOUT_MS);
    };

    try {
      const resuming = offset > 0;
      // safeFetch validates the URL (and every redirect hop) against the SSRF
      // policy before the worker makes any outbound request.
      const res = await safeFetch(
        input,
        {
          headers: {
            'User-Agent': USER_AGENT,
            // Byte offsets must match the file on disk, so no compression.
            'Accept-Encoding': 'identity',
            ...(resuming
              ? {
                  Range: `bytes=${offset}-`,
                  ...(validator ? { 'If-Range': validator } : {}),
                }
              : {}),
          },
          signal: cancelled
            ? AbortSignal.any([stall.signal, cancelled])
            : stall.signal,
        },
        { timeoutMs: remainingMs },
      );
      url = res.url || String(input);

      if (res.status === 416 && dest) {
        await res.body?.cancel().catch(noop);
        // `bytes */<size>` equal to what's on disk: the file was complete.
        const size = /^bytes \*\/(\d+)$/.exec(
          res.headers.get('content-range') ?? '',
        );
        if (size && Number(size[1]) === offset) break;
        // Otherwise the Range no longer fits the resource: start over.
        await truncate(dest, 0);
        throw new DownloadError(`${url} rejected the resume range`, true);
      }
      if (!res.ok || !res.body) {
        await res.body?.cancel().catch(noop);
        throw new DownloadError(
          `Failed to fetch ${url}: ${res.status} ${res.statusText}`,
          isTransientStatus(res.status),
        );
      }

      if (!dest) {
        // Extract file extension from URL path
        const ext = extname(new URL(url).pathname);
        dest = join(dir, ext ? `${nanoid()}${ext}` : nanoid());
      }

      const append = resuming && res.status === 206;
      const encoding = res.headers.get('content-encoding');
      const rangeTotal = totalSize(res);
      if (
        append &&
        (contentRangeStart(res) !== offset ||
          // Bytes must match the file on disk, and come from the same file
          // (the size changing means it was replaced; covers servers that
          // gave no validator for If-Range).
          (encoding !== null && encoding !== 'identity') ||
          (total !== null && rangeTotal !== null && rangeTotal !== total))
      ) {
        // A server that misreports ranges: restart without Range.
        await res.body.cancel().catch(noop);
        await truncate(dest, 0);
        throw new DownloadError(
          `Resume of ${url} returned Content-Range ${res.headers.get('content-range')} (encoding ${encoding ?? 'none'}), expected start ${offset} of ${total ?? 'unknown'}; restarting`,
          true,
        );
      }
      if (resuming && !append) {
        log.warn(
          `${url} ignored the Range request or changed; restarting the download`,
        );
      }
      if (!append) {
        // If-Range needs a strong validator; a weak ETag would make every
        // resume restart from scratch.
        const etag = res.headers.get('etag');
        validator =
          (etag && !etag.startsWith('W/') ? etag : null) ??
          res.headers.get('last-modified');
      }
      total = rangeTotal ?? (append ? total : null);

      let written = append ? offset : 0;
      const progress = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          written += chunk.length;
          if (written > maxBytes) {
            callback(
              new DownloadError(
                `Download from ${url} exceeded the maximum of ${maxBytes} bytes`,
                false,
              ),
            );
            return;
          }
          resetStall();
          heartbeat(`chunk from ${url}`);
          callback(null, chunk);
        },
      });

      const out = createWriteStream(dest, { flags: append ? 'a' : 'w' });
      try {
        await pipeline(
          Readable.fromWeb(
            res.body as import('node:stream/web').ReadableStream,
          ),
          progress,
          out,
        );
      } finally {
        // Let any in-flight write land before the size on disk is read as the
        // resume offset, or a late write could interleave with the append.
        if (!out.closed) {
          await new Promise<void>((resolve) =>
            out.once('close', () => resolve()),
          );
        }
      }

      // A clean close before the declared size is a dropped transfer too.
      if (total === null || written >= total) break;
      throw new DownloadError(
        `Connection to ${url} closed at ${written} of ${total} bytes`,
        true,
      );
    } catch (err) {
      // The SSRF guard refusing a URL (or a redirect hop) is final, as are
      // cancellation and local disk failures.
      if (err instanceof UnsafeUrlError) throw err;
      if (cancelled?.aborted) throw err;
      if (LOCAL_ERROR_CODES.has((err as { code?: string }).code ?? '')) {
        throw err;
      }
      if (err instanceof DownloadError && !err.resumable) throw err;
      // Everything else (connection reset, stall, dropped stream) reconnects.

      const now = dest ? await sizeOnDisk(dest) : 0;
      resumesWithoutProgress = now > offset ? 0 : resumesWithoutProgress + 1;
      if (resumesWithoutProgress >= MAX_RESUMES_WITHOUT_PROGRESS) throw err;

      const backoffMs = 1000 * 2 ** resumesWithoutProgress;
      if (Date.now() + backoffMs >= deadline) {
        throw new DownloadError(
          `Download of ${url} did not finish within ${maxDurationMs}ms`,
          false,
        );
      }
      log.warn(
        `Download of ${url} interrupted at ${now}${total ? ` of ${total}` : ''} bytes (${err instanceof Error ? err.message : String(err)}); resuming`,
      );
      heartbeat(`resuming ${url} at ${now} bytes`);
      await delay(backoffMs, undefined, { signal: cancelled });
    } finally {
      clearTimeout(stallTimer);
    }
  }

  log.info(`Downloaded ${url} to ${dest}`);
  return dest as string;
}
