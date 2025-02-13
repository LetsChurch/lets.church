import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, noop } from 'lodash-es';
import { nanoid } from 'nanoid';
import logger from '../logger';

export async function downloadUrl(
  input: URL | string,
  dir: string,
  log: typeof logger,
  heartbeat = noop,
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
