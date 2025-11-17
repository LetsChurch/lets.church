import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Logger } from '@letschurch/util';
import { noop } from 'es-toolkit';
import { nanoid } from 'nanoid';

export async function downloadUrl(
  input: URL | string,
  dir: string,
  log: Logger,
  heartbeat: (s: string) => unknown = noop,
): Promise<string> {
  const url = new URL(input);
  log.info(`Downloading URL ${url}`);
  const res = await fetch(url);

  if (!res.ok || !res.body) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  // Write fetch result to file
  const dest = join(dir, nanoid());
  const stream = createWriteStream(dest);

  const heartbeatTransform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
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
