import { createReadStream, createWriteStream } from 'node:fs';
import { open as fsOpen, stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3,
  type StorageClass,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Logger } from '@letschurch/util';
import { invariant, noop } from 'es-toolkit';
import pMap from 'p-map';
import pRetry from 'p-retry';
import sanitizeFilename from 'sanitize-filename';
import type { MergeExclusive } from 'type-fest';
import { v4 as uuid } from 'uuid';

export const PART_SIZE = 10_000_000;
const NOT_FOUND_ERROR_CODES: Record<string, true> = {
  '404': true,
  NotFound: true,
  NoSuchKey: true,
  NoSuchObject: true,
};

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const metadata = Reflect.get(error, '$metadata');
  if (
    typeof metadata === 'object' &&
    metadata !== null &&
    Reflect.get(metadata, 'httpStatusCode') === 404
  ) {
    return true;
  }
  return ['name', 'code', 'Code'].some((property) => {
    const value = Reflect.get(error, property);
    return typeof value === 'string' && NOT_FOUND_ERROR_CODES[value] === true;
  });
}

export type S3ClientId = 'INGEST' | 'PUBLIC' | 'BACKUP';

export type S3Config = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type LcS3ClientOptions = S3Config & {
  logger?: Logger;
  storageClass?: StorageClass;
};

export class LcS3Client {
  private readonly client: S3;
  private readonly bucket: string;
  private readonly logger?: Logger;
  private readonly storageClass?: StorageClass;

  constructor({
    bucket,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    logger,
    storageClass,
  }: LcS3ClientOptions) {
    this.bucket = bucket;
    this.logger = logger;
    this.storageClass = storageClass;
    this.client = new S3({
      region,
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  getS3ProtocolUri(key: string) {
    return `s3://${this.bucket}/${key}`;
  }

  /**
   * Get the underlying S3 client for direct access if needed.
   */
  getS3Client(): S3 {
    return this.client;
  }

  /**
   * Get the bucket name.
   */
  getBucket(): string {
    return this.bucket;
  }

  async createMultipartUpload(key: string, contentType: string) {
    const { UploadId: uploadId, Key: uploadKey } = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: `${key}/${uuid()}`,
        ContentType: contentType,
        ...(this.storageClass ? { StorageClass: this.storageClass } : {}),
      }),
    );

    invariant(uploadId && uploadKey, 'Failed to create multipart upload id!');

    return { uploadId, uploadKey };
  }

  createPresignedPartUploadUrl(
    uploadId: string,
    uploadKey: string,
    part: number,
  ) {
    invariant(
      part > 0 && part <= 10_000,
      `Part number must be between 1 and 10,000 inclusive, was ${part}`,
    );

    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: this.bucket,
        UploadId: uploadId,
        Key: uploadKey,
        PartNumber: part,
      }),
      { expiresIn: 60 * 60 * 12 }, // 12 hours
    );
  }

  async createPresignedPartUploadUrls(
    uploadId: string,
    uploadKey: string,
    size: number,
  ) {
    return pMap(
      Array(Math.ceil(size / PART_SIZE)).fill(null),
      (_, i) => this.createPresignedPartUploadUrl(uploadId, uploadKey, i + 1),
      { concurrency: 5 },
    );
  }

  async completeMultipartUpload(
    uploadId: string,
    uploadKey: string,
    eTags: Array<string>,
  ) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: uploadKey,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: eTags.map((tag, i) => ({ ETag: tag, PartNumber: i + 1 })),
        },
      }),
    );
  }

  async abortMultipartUpload(uploadId: string, uploadKey: string) {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: uploadKey,
        UploadId: uploadId,
      }),
    );
  }

  async createPresignedUploadUrl(key: string, contentType: string) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 5 * 60 }, // 5 Minutes
    );
  }

  async headObject(key: string) {
    return this.client.headObject({
      Bucket: this.bucket,
      Key: key,
    });
  }

  async headObjectIfExists(key: string) {
    try {
      return await this.headObject(key);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async getObject(key: string) {
    return this.client.getObject({
      Bucket: this.bucket,
      Key: key,
    });
  }

  async streamObjectToFile(
    key: string,
    path: string,
    extra?:
      | {
          heartbeat?: (arg: string) => unknown;
          signal?: AbortSignal;
          partSize?: number;
        }
      | ((arg: string) => unknown),
  ) {
    const opts: {
      heartbeat?: (arg: string) => unknown;
      signal?: AbortSignal;
      partSize?: number;
    } = typeof extra === 'function' ? { heartbeat: extra } : (extra ?? {});
    const partSize = opts.partSize ?? 100 * 1024 * 1024;
    const { heartbeat, signal } = opts;

    // Range-based download: one HEAD then sequential GETs of `partSize`
    // bytes each. Heartbeats fire once per completed part — i.e. tied to
    // bytes actually persisted, not to "did a chunk appear on the wire".
    // The previous per-chunk-Transform pattern stopped heartbeating during
    // TCP/S3 stalls, which let a long stall blow past `heartbeatTimeout`.
    // The AbortSignal is plumbed into both HEAD and each GET so activity
    // cancellation aborts the in-flight HTTP request instead of letting
    // the download finish into a dead activity.
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: signal },
    );
    const total = head.ContentLength;
    invariant(total, `HeadObject returned no ContentLength for ${key}`);

    // Create+truncate so each ranged part can write at its byte offset
    // via `flags: 'r+'`.
    const fh = await fsOpen(path, 'w');
    await fh.close();

    let downloaded = 0;
    while (downloaded < total) {
      signal?.throwIfAborted();
      const end: number = Math.min(downloaded + partSize, total) - 1;

      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: `bytes=${downloaded}-${end}`,
        }),
        { abortSignal: signal },
      );
      invariant(res.Body, `No body in GetObject range response for ${key}`);

      await pipeline(
        res.Body.transformToWebStream() as unknown as NodeJS.ReadableStream,
        createWriteStream(path, { flags: 'r+', start: downloaded }),
      );

      downloaded = end + 1;
      heartbeat?.(`${downloaded}/${total}`);
    }
  }

  async *listObjects(
    prefix?: string,
    options?: {
      // Resume from a prior page. Pass the token surfaced via onPage to pick
      // a long scan back up (e.g. after an activity heartbeat/retry) instead
      // of restarting from the first page.
      startContinuationToken?: string;
      // Called after each page with the token that would fetch the *next*
      // page (undefined once the listing is exhausted). Lets a long-running
      // consumer checkpoint its position.
      onPage?: (nextContinuationToken: string | undefined) => void;
    },
  ) {
    let continuationToken: string | undefined = options?.startContinuationToken;

    do {
      const listCmd: ListObjectsV2Command = new ListObjectsV2Command({
        Bucket: this.bucket,
        ...(prefix ? { Prefix: prefix } : {}),
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      });

      const listRes = await this.client.send(listCmd);

      continuationToken = listRes.IsTruncated
        ? listRes.NextContinuationToken
        : undefined;

      for (const entry of listRes.Contents?.filter(Boolean) ?? []) {
        yield entry;
      }

      options?.onPage?.(continuationToken);
    } while (continuationToken);
  }

  /**
   * Read an object's body fully into a string. Convenience for small text
   * objects (e.g. HLS playlists, JSON manifests).
   */
  async getObjectText(key: string): Promise<string> {
    const res = await this.getObject(key);
    invariant(res.Body, `No body in GetObject response for ${key}`);
    return res.Body.transformToString();
  }

  async *listKeys(prefix?: string) {
    for await (const { Key } of this.listObjects(prefix)) {
      if (Key) {
        yield Key;
      }
    }
  }

  async *listPrefixes() {
    const seen = new Set();

    for await (const key of this.listKeys()) {
      const prefix = key.split('/').at(0);

      if (prefix && !seen.has(prefix)) {
        yield prefix;
      }

      seen.add(prefix);
    }
  }

  async putFile({
    key,
    contentType,
    body,
    path,
    contentLength,
  }: {
    key: string;
    contentType: string;
    contentLength?: number;
  } & MergeExclusive<{ body: Readable | Buffer }, { path: string }>) {
    invariant(body || path, 'Body or path must be provided to putFile');

    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      Body: body ? body : createReadStream(path),
      ...(contentLength ? { ContentLength: contentLength } : {}),
      ...(this.storageClass ? { StorageClass: this.storageClass } : {}),
    });
    return this.client.send(cmd);
  }

  async putFileMultipart({
    key,
    contentType,
    path,
    onProgress,
    signal,
  }: {
    key: string;
    contentType: string;
    path: string;
    onProgress?: (progress: number) => unknown;
    signal?: AbortSignal;
  }) {
    const fileSize = (await stat(path)).size;
    const partSize = 100 * 1024 ** 2; // 100 MB per part
    const numParts = Math.ceil(fileSize / partSize);

    const createUpload = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ...(this.storageClass ? { StorageClass: this.storageClass } : {}),
      }),
    );

    const uploadId = createUpload.UploadId;
    try {
      const completedParts: Array<{ PartNumber: number; ETag: string }> = [];

      for (let i = 0; i < numParts; i++) {
        signal?.throwIfAborted();
        const start = i * partSize;
        const end = Math.min(start + partSize, fileSize) - 1;

        const { ETag } = await this.client.send(
          new UploadPartCommand({
            Bucket: this.bucket,
            Key: key,
            PartNumber: i + 1,
            UploadId: uploadId,
            Body: createReadStream(path, { start, end }),
          }),
        );

        invariant(ETag, 'Failed to get Etag');

        completedParts.push({ PartNumber: i + 1, ETag });
        onProgress?.(i / numParts);
      }

      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          MultipartUpload: {
            Parts: completedParts,
          },
          UploadId: uploadId,
        }),
      );
    } catch (err) {
      // Abort is best-effort cleanup — it must NOT swallow the original failure.
      // Returning normally here would make callers (Glacier backup, import)
      // treat a never-completed upload as success and record it as stored.
      try {
        await this.client.send(
          new AbortMultipartUploadCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
          }),
        );
      } catch (abortErr) {
        throw new AggregateError(
          [err, abortErr],
          'Multipart upload failed and the subsequent abort also failed',
        );
      }
      throw err;
    }
  }

  async retryablePutFile({
    maxAttempts = 5,
    signal,
    ...otherOps
  }: {
    key: string;
    contentType: string;
    contentLength?: number;
    maxAttempts?: number;
    signal: AbortSignal;
  } & MergeExclusive<{ body: Buffer }, { path: string }>) {
    return pRetry(() => this.putFile(otherOps), {
      signal,
      retries: maxAttempts,
      onFailedAttempt: (ctx) => {
        this.logger?.warn(`Error uploading ${otherOps.key}`);
        this.logger?.warn(ctx.error.message);
        this.logger?.warn(
          `Attempt ${ctx.attemptNumber} failed. There are ${ctx.retriesLeft} retries left.`,
        );
      },
    });
  }

  async deleteFile(key: string) {
    const cmd = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return this.client.send(cmd);
  }

  async deleteKeys(keys: string[], heartbeat = noop) {
    if (keys.length === 0) return 0;

    let totalDeleted = 0;
    const batchErrors: Error[] = [];

    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      try {
        const res = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })) },
          }),
        );
        totalDeleted += res.Deleted?.length ?? 0;
        for (const e of res.Errors ?? []) {
          const err = new Error(
            `S3 delete failed for key ${e.Key}: ${e.Code} ${e.Message}`,
          );
          this.logger?.error({ err, context: { totalDeleted } });
          batchErrors.push(err);
        }
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        this.logger?.error({ err, context: { batch, totalDeleted } });
        batchErrors.push(err);
      }
      heartbeat();
    }

    this.logger?.info(`Deleted ${totalDeleted} objects from ${this.bucket}`);

    if (batchErrors.length > 0) {
      throw new AggregateError(
        batchErrors,
        `Failed to delete some objects from ${this.bucket}; ${totalDeleted} successfully deleted`,
      );
    }

    return totalDeleted;
  }

  async deletePrefix(prefix: string, heartbeat = noop) {
    let totalCount = 0;
    let currentCount = 0;

    this.logger?.info(
      `Deleting objects from ${this.bucket} with prefix ${prefix}`,
    );

    do {
      const listCmd: ListObjectsV2Command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      });

      const listRes = await this.client.send(listCmd);

      heartbeat();

      const objects = listRes.Contents?.map((entry) => entry.Key ?? '')
        .filter(Boolean)
        .map((key) => ({
          Key: key,
        }));

      currentCount = objects?.length ?? 0;
      totalCount += currentCount;

      if (currentCount > 0) {
        this.logger?.info(
          `Deleting ${currentCount} objects from ${this.bucket} with prefix ${prefix}`,
        );

        const deleteCmd = new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: objects,
          },
        });

        await this.client.send(deleteCmd);

        heartbeat();
      }
    } while (currentCount > 0);

    this.logger?.info(
      `Done deleting ${totalCount} objects from ${this.bucket} with prefix ${prefix}`,
    );

    return totalCount;
  }

  async getSignedGetObject(
    key: string,
    options?: {
      expiresIn?: number;
      responseContentDisposition?: string;
    },
  ) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(options?.responseContentDisposition
          ? { ResponseContentDisposition: options.responseContentDisposition }
          : {}),
      }),
      options?.expiresIn ? { expiresIn: options.expiresIn } : undefined,
    );
  }
}

/**
 * Generate a signed S3 URL that forces download with a specific filename.
 *
 * This function creates a presigned URL with the Content-Disposition header set to
 * force the browser to download the file instead of displaying it. The filename is
 * automatically sanitized using `sanitize-filename` to ensure it's safe for use
 * across different operating systems.
 *
 * @param publicS3 - The S3 client instance
 * @param key - The S3 object key (path) to generate the URL for
 * @param filename - The desired filename for the download (will be sanitized automatically)
 * @returns A promise that resolves to a presigned URL with Content-Disposition header
 *
 * @example
 * ```ts
 * const url = await getPublicUrlWithFilename(
 *   publicS3,
 *   'media/123/video.mp4',
 *   'My Video 1080p.mp4' // Automatically sanitized
 * );
 * ```
 */
export async function getPublicUrlWithFilename(
  publicS3: LcS3Client,
  key: string,
  filename: string,
) {
  return publicS3.getSignedGetObject(key, {
    responseContentDisposition: `attachment; filename="${sanitizeFilename(
      filename,
    )}"`,
  });
}

export async function createPresignedPartUploadUrls(
  client: LcS3Client,
  uploadId: string,
  uploadKey: string,
  size: number,
) {
  return client.createPresignedPartUploadUrls(uploadId, uploadKey, size);
}
