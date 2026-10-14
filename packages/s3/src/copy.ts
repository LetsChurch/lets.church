import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { invariant } from 'es-toolkit';

import type { LcS3Client } from './index.js';

/** Objects at or below this size are copied through memory; larger ones spill to disk. */
const IN_MEMORY_LIMIT = 64 * 1024 * 1024;

type ObjectHead = { ContentLength?: number; ETag?: string };

/**
 * Treat two objects as the same when their sizes match and, if both ETags are
 * plain single-part MD5s, those match too. Multipart ETags depend on part size
 * (which differs between our uploaders), so they can't be compared; size is
 * the best signal there.
 */
function sameObject(a: ObjectHead, b: ObjectHead): boolean {
  if ((a.ContentLength ?? 0) !== (b.ContentLength ?? 0)) return false;
  const single = (etag?: string) => !!etag && !etag.includes('-');
  if (single(a.ETag) && single(b.ETag)) return a.ETag === b.ETag;
  return true;
}

export type CopyObjectResult = {
  key: string;
  bytes: number;
  /** True when the target already held a matching object. */
  skipped: boolean;
};

/**
 * Copy one object between two buckets that may live at different providers.
 *
 * Cross-provider copies can't use server-side CopyObject, so the object is
 * streamed GET → PUT (multipart above 64MB). The copy is idempotent: an
 * existing target object that matches (see sameObject) is left alone, which
 * lets an interrupted move resume without re-transferring finished objects. The
 * target is HEADed afterwards and its size compared to the source, on top of
 * the SDK's per-request integrity checksums.
 */
export async function copyObjectBetween(
  source: LcS3Client,
  target: LcS3Client,
  key: string,
  opts: { signal?: AbortSignal; heartbeat?: (detail: string) => unknown } = {},
): Promise<CopyObjectResult> {
  const head = await source.headObject(key);
  const bytes = head.ContentLength ?? 0;
  const contentType = head.ContentType ?? 'application/octet-stream';

  const existing = await target.headObjectIfExists(key);
  if (existing && sameObject(head, existing)) {
    return { key, bytes, skipped: true };
  }

  if (bytes <= IN_MEMORY_LIMIT) {
    const res = await source.getObject(key);
    invariant(res.Body, `No body in GetObject response for ${key}`);
    const body = Buffer.from(await res.Body.transformToByteArray());
    invariant(
      body.length === bytes,
      `Short read copying ${key}: expected ${bytes} bytes, got ${body.length}`,
    );
    await target.putFile({ key, contentType, body, contentLength: bytes });
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'lc-copy-'));
    try {
      const path = join(dir, 'object');
      await source.streamObjectToFile(key, path, {
        signal: opts.signal,
        heartbeat: opts.heartbeat,
      });
      await target.putFileMultipart({
        key,
        contentType,
        path,
        signal: opts.signal,
        onProgress: (p) => opts.heartbeat?.(`${key} ${Math.round(p * 100)}%`),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  const written = await target.headObject(key);
  invariant(
    (written.ContentLength ?? 0) === bytes,
    `Size mismatch after copying ${key}: source ${bytes}, target ${written.ContentLength}`,
  );
  return { key, bytes, skipped: false };
}
