import { createWriteStream } from 'node:fs';
import { extname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Logger } from '@letschurch/util';
import { noop } from 'es-toolkit';
import { nanoid } from 'nanoid';
import { safeFetch } from './safe-url';
import { USER_AGENT } from './user-agent';

// Cap a single import download so a malicious or broken source can't exhaust
// worker disk. Generous by default; override per-deployment if needed.
const MAX_DOWNLOAD_BYTES = Number(
  process.env.IMPORT_MAX_DOWNLOAD_BYTES ?? 32 * 1024 * 1024 * 1024,
);

export async function downloadUrl(
  input: URL | string,
  dir: string,
  log: Logger,
  heartbeat: (s: string) => unknown = noop,
): Promise<string> {
  // safeFetch validates the URL (and every redirect hop) against the SSRF
  // policy before the worker makes any outbound request.
  log.info(`Downloading URL ${String(input)}`);
  const res = await safeFetch(input, {
    headers: { 'User-Agent': USER_AGENT },
  });
  const url = res.url || String(input);

  if (!res.ok || !res.body) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  // Extract file extension from URL path
  const urlPath = new URL(url).pathname;
  const ext = extname(urlPath);
  const filename = ext ? `${nanoid()}${ext}` : nanoid();

  // Write fetch result to file
  const dest = join(dir, filename);
  const stream = createWriteStream(dest);

  let downloadedBytes = 0;
  const heartbeatTransform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloadedBytes += chunk.length;
      if (downloadedBytes > MAX_DOWNLOAD_BYTES) {
        callback(
          new Error(
            `Download from ${url} exceeded the maximum of ${MAX_DOWNLOAD_BYTES} bytes`,
          ),
        );
        return;
      }
      heartbeat(`chunk from ${url}`);
      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(res.body as import('node:stream/web').ReadableStream),
    heartbeatTransform,
    stream,
  );

  log.info(`Downloaded ${url} to ${dest}`);

  return dest;
}
