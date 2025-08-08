import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { noop } from 'es-toolkit';
import { nanoid } from 'nanoid';
import type logger from '@/util/logger';

export async function downloadUrl(
  input: URL | string,
  dir: string,
  log: typeof logger,
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

  await pipeline(
    res.body,
    (chunk) => {
      heartbeat(`chunk from ${url}`);
      return chunk;
    },
    stream,
  );

  log.info(`Downloaded ${url} to ${dest}`);

  return dest;
}
