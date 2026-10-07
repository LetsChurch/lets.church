/**
 * Move one video from YouTube to Let's Church without holding the whole file:
 * stream the owner's Studio download, cut it into the server's part size, and
 * PUT the parts straight to the presigned S3 URLs a few at a time.
 */
import pRetry, { AbortError } from 'p-retry';

import { toLetsChurchPublishedAt } from './dates';
import { lcApi, type MultipartTarget } from './lc-api';
import type { MirrorJob, StudioVideo } from './types';

const PART_CONCURRENCY = 3;
const PART_RETRIES = 5;

export class CancelledError extends Error {
  override name = 'CancelledError';
}

/**
 * Re-chunk a byte stream into `partSize` pieces (the last may be shorter).
 * Holds at most one part in memory.
 */
export async function* splitIntoParts(
  stream: ReadableStream<Uint8Array>,
  partSize: number,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  let part = new Uint8Array(partSize);
  let filled = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      let offset = 0;
      while (offset < value.length) {
        const take = Math.min(partSize - filled, value.length - offset);
        part.set(value.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;
        if (filled === partSize) {
          yield part;
          part = new Uint8Array(partSize);
          filled = 0;
        }
      }
    }
    if (filled > 0) {
      yield part.subarray(0, filled);
    }
  } finally {
    reader.releaseLock();
  }
}

function guessMimeType(contentType: string | null, fileName: string) {
  const type = contentType?.split(';')[0]?.trim().toLowerCase();
  if (type && /^(video|audio)\/[\w.+-]+$/.test(type)) {
    return type;
  }
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    case 'mkv':
      return 'video/x-matroska';
    default:
      return 'video/mp4';
  }
}

/** Temp files in the origin-private file system are named with this prefix. */
export const SPOOL_FILE_PREFIX = 'mirror-';

export type SpoolDirectory = Pick<
  FileSystemDirectoryHandle,
  'getFileHandle' | 'removeEntry' | 'keys'
>;

function spoolDirectory(): Promise<SpoolDirectory> {
  return navigator.storage.getDirectory();
}

/**
 * Some downloads don't advertise a length, but the server needs the size up
 * front to presign parts. Spool those to the origin-private file system first.
 * A failed or aborted download removes its partial file before rethrowing.
 */
export async function spoolToDisk(
  stream: ReadableStream<Uint8Array>,
  jobId: string,
  dir?: SpoolDirectory,
): Promise<{ file: File; cleanup: () => Promise<void> }> {
  const directory = dir ?? (await spoolDirectory());
  const name = SPOOL_FILE_PREFIX + jobId;
  const remove = () => directory.removeEntry(name).catch(() => undefined);
  try {
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await stream.pipeTo(writable);
    return { file: await handle.getFile(), cleanup: remove };
  } catch (err) {
    await remove();
    throw err;
  }
}

/**
 * Delete every spooled download. Called when the queue runner starts: a tab
 * closed or a browser crash mid-transfer leaves files no one will clean up,
 * and only one runner exists at a time (see queue/main.tsx), so nothing is
 * using them.
 */
export async function clearSpoolFiles(dir?: SpoolDirectory) {
  const directory = dir ?? (await spoolDirectory());
  const stale: Array<string> = [];
  for await (const name of directory.keys()) {
    if (name.startsWith(SPOOL_FILE_PREFIX)) {
      stale.push(name);
    }
  }
  await Promise.all(
    stale.map((name) => directory.removeEntry(name).catch(() => undefined)),
  );
}

async function putPart(
  url: string,
  body: Uint8Array<ArrayBuffer>,
  signal: AbortSignal,
) {
  return pRetry(
    async () => {
      const res = await fetch(url, { method: 'PUT', body, signal });
      if (!res.ok) {
        const error = new Error(`Part upload failed (${res.status})`);
        // Presigned URL expired or was rejected: retrying won't help.
        throw res.status === 403 ? new AbortError(error) : error;
      }
      const etag = res.headers.get('etag');
      if (!etag) {
        throw new AbortError(
          'Storage did not return an ETag (check the ingest bucket CORS ExposeHeaders).',
        );
      }
      return etag.replaceAll('"', '');
    },
    { retries: PART_RETRIES, signal },
  );
}

async function uploadParts({
  stream,
  target,
  signal,
  onPartDone,
}: {
  stream: ReadableStream<Uint8Array>;
  target: Pick<MultipartTarget, 'partSize' | 'urls'>;
  signal: AbortSignal;
  onPartDone: (bytes: number) => void;
}): Promise<Array<string>> {
  const etags: Array<string> = [];
  const inFlight = new Set<Promise<void>>();
  // First part failure; checked between parts so we stop reading the download.
  let failure: unknown = null;
  let index = 0;

  for await (const part of splitIntoParts(stream, target.partSize)) {
    if (failure) {
      throw failure;
    }
    const url = target.urls[index];
    if (!url) {
      throw new Error('The download is larger than YouTube reported.');
    }
    const partIndex = index++;
    const tracked: Promise<void> = putPart(url, part, signal)
      .then((etag) => {
        etags[partIndex] = etag;
        onPartDone(part.byteLength);
      })
      .catch((err: unknown) => {
        failure ??= err;
      })
      .finally(() => inFlight.delete(tracked));
    inFlight.add(tracked);
    if (inFlight.size >= PART_CONCURRENCY) {
      await Promise.race(inFlight);
    }
  }
  await Promise.all(inFlight);
  if (failure) {
    throw failure;
  }

  if (index !== target.urls.length) {
    throw new Error('The download ended early; try again.');
  }
  return etags;
}

const THUMBNAIL_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type ThumbnailType = (typeof THUMBNAIL_TYPES)[number];
// Matches the server's cap (MIRROR_THUMBNAIL_MAX_BYTES).
const THUMBNAIL_MAX_BYTES = 20_000_000;

function thumbnailType(contentType: string | null): ThumbnailType | null {
  const type = contentType?.split(';')[0]?.trim().toLowerCase();
  return THUMBNAIL_TYPES.find((t) => t === type) ?? null;
}

/**
 * Mirror the video's YouTube thumbnail as the upload's custom thumbnail.
 * Best-effort: returns a warning instead of throwing, so a thumbnail problem
 * never costs the user the video (it still gets generated thumbnails).
 * Runs before the media is finalized: the server only accepts thumbnails for
 * a still-pending mirror.
 */
export async function uploadThumbnail({
  thumbnailUrl,
  channelId,
  uploadId,
  signal,
}: {
  thumbnailUrl: string | null;
  channelId: string;
  uploadId: string;
  signal: AbortSignal;
}): Promise<string | null> {
  if (!thumbnailUrl) {
    return null;
  }

  let target: Awaited<ReturnType<typeof lcApi.createThumbnailUpload>> | null =
    null;
  try {
    const res = await fetch(thumbnailUrl, { signal });
    const type = thumbnailType(res.headers.get('content-type'));
    if (!res.ok || !type) {
      return `Couldn't download the YouTube thumbnail (${res.status}); Let's Church will generate one.`;
    }
    const image = await res.blob();
    if (image.size === 0 || image.size > THUMBNAIL_MAX_BYTES) {
      return "The YouTube thumbnail wasn't usable; Let's Church will generate one.";
    }

    target = await lcApi.createThumbnailUpload({
      channelId,
      uploadId,
      uploadMimeType: type,
      bytes: image.size,
    });
    const etags = await uploadParts({
      stream: image.stream(),
      target,
      signal,
      onPartDone: () => undefined,
    });
    await lcApi.finalizeUpload({
      channelId,
      uploadId,
      s3UploadId: target.s3UploadId,
      s3UploadKey: target.s3UploadKey,
      s3PartETags: etags,
    });
    return null;
  } catch (err) {
    if (signal.aborted) {
      throw err;
    }
    if (target) {
      await lcApi
        .abortThumbnailUpload({
          channelId,
          uploadId,
          s3UploadId: target.s3UploadId,
          s3UploadKey: target.s3UploadKey,
        })
        .catch(() => undefined);
    }
    return "The YouTube thumbnail didn't mirror; Let's Church will generate one.";
  }
}

export type TransferHooks = {
  signal: AbortSignal;
  /**
   * Re-read the video from an open Studio tab (download and thumbnail links
   * are signed and expire), or null to use what was stored at enqueue time.
   */
  refreshVideo: () => Promise<StudioVideo | null>;
  onUpdate: (patch: Partial<MirrorJob>) => Promise<void>;
};

export async function runTransfer(
  job: MirrorJob,
  { signal, refreshVideo, onUpdate }: TransferHooks,
): Promise<{ uploadId: string }> {
  const fresh = await refreshVideo().catch(() => null);
  const downloadUrl = fresh?.downloadUrl ?? job.video.downloadUrl;
  const thumbnailUrl = fresh?.thumbnailUrl ?? job.video.thumbnailUrl;
  if (!downloadUrl) {
    throw new Error('YouTube did not offer a download for this video.');
  }

  const res = await fetch(downloadUrl, { credentials: 'include', signal });
  const contentType = res.headers.get('content-type');
  if (!res.ok || !res.body || contentType?.startsWith('text/html')) {
    throw new Error(
      res.ok
        ? 'YouTube sent a web page instead of the video. Open YouTube Studio, make sure you are signed in, and retry.'
        : `YouTube download failed (${res.status}). The link may have expired; retry from YouTube Studio.`,
    );
  }

  const fileName = job.video.originalFileName || `${job.video.videoId}.mp4`;
  let stream: ReadableStream<Uint8Array> = res.body;
  let bytes = Number(res.headers.get('content-length'));
  let cleanup: (() => Promise<void>) | null = null;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    const spooled = await spoolToDisk(res.body, job.id);
    stream = spooled.file.stream();
    bytes = spooled.file.size;
    cleanup = spooled.cleanup;
  }

  try {
    await onUpdate({ bytesTotal: bytes, bytesUploaded: 0 });

    const target = await lcApi.createUpload({
      channelId: job.channelId,
      title: job.video.title.trim() || fileName,
      description: job.video.description,
      publishedAt: toLetsChurchPublishedAt(job.video.publishedAt),
      originalFileName: fileName,
      uploadMimeType: guessMimeType(contentType, fileName),
      bytes,
      ...(job.visibility ? { visibility: job.visibility } : {}),
    });
    const upload = {
      uploadId: target.uploadId,
      s3UploadId: target.s3UploadId,
      s3UploadKey: target.s3UploadKey,
    };
    await onUpdate({ upload });

    const warning = await uploadThumbnail({
      thumbnailUrl,
      channelId: job.channelId,
      uploadId: upload.uploadId,
      signal,
    });
    if (warning) {
      await onUpdate({ warning });
    }

    let uploaded = 0;
    const etags = await uploadParts({
      stream,
      target,
      signal,
      onPartDone: (n) => {
        uploaded += n;
        void onUpdate({ bytesUploaded: uploaded });
      },
    });

    if (signal.aborted) {
      throw new CancelledError('Cancelled');
    }
    await onUpdate({ status: 'finalizing' });
    await lcApi.finalizeUpload({
      channelId: job.channelId,
      ...upload,
      s3PartETags: etags,
    });
    return { uploadId: upload.uploadId };
  } finally {
    await cleanup?.().catch(() => undefined);
  }
}
