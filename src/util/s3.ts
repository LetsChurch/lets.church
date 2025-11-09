import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { type Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  type GetObjectCommandInput,
  ListObjectsV2Command,
  PutObjectCommand,
  S3,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { invariant, noop } from 'es-toolkit';
import pMap from 'p-map';
import pRetry from 'p-retry';
import sanitizeFilename from 'sanitize-filename';
import type { MergeExclusive } from 'type-fest';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import logger from './logger';

const moduleLogger = logger.child({ module: 'util/s3' });

const env = z
  .object({
    S3_INGEST_BUCKET: z.string(),
    S3_INGEST_REGION: z.string(),
    S3_INGEST_ENDPOINT: z.string(),
    S3_INGEST_ACCESS_KEY_ID: z.string(),
    S3_INGEST_SECRET_ACCESS_KEY: z.string(),
    S3_PUBLIC_BUCKET: z.string(),
    S3_PUBLIC_REGION: z.string(),
    S3_PUBLIC_ENDPOINT: z.string(),
    S3_PUBLIC_ACCESS_KEY_ID: z.string(),
    S3_PUBLIC_SECRET_ACCESS_KEY: z.string(),
  })
  .parse(process.env);

export const PART_SIZE = 10_000_000;

export type S3ClientId = 'INGEST' | 'PUBLIC';

export class LcS3Client {
  private readonly client: S3;
  private readonly bucket: string;

  constructor({
    bucket,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
  }: {
    bucket: string;
    region: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) {
    this.bucket = bucket;
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

  async createMultipartUpload(key: string, contentType: string) {
    const { UploadId: uploadId, Key: uploadKey } = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: `${key}/${uuid()}`,
        ContentType: contentType,
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
    try {
      return await this.client.headObject({
        Bucket: this.bucket,
        Key: key,
      });
    } catch (e) {
      moduleLogger.error(e);
      return null;
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
      | (Omit<GetObjectCommandInput, 'Bucket' | 'Key'> & {
          heartbeat?: (arg: string) => unknown;
        })
      | ((arg: string) => unknown),
  ) {
    const { getArgs, heartbeat } =
      typeof extra === 'function'
        ? { getArgs: {}, heartbeat: extra }
        : { getArgs: extra, heartbeat: undefined };
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...getArgs,
    });
    const res = await this.client.send(cmd);

    invariant(res.Body, 'No body in response!');
    return pipeline(
      res.Body.transformToWebStream() as unknown as NodeJS.ReadableStream,
      new Transform({
        transform(chunk, _encoding, callback) {
          this.push(chunk);
          heartbeat?.(`${chunk.length} bytes`);
          callback();
        },
      }),
      createWriteStream(path),
    );
  }

  async *listObjects(prefix?: string) {
    let continuationToken: string | undefined;

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
    } while (continuationToken);
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
    } catch {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
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
        moduleLogger.warn(`Error uploading ${otherOps.key}`);
        moduleLogger.warn(ctx.error.message);
        moduleLogger.warn(
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

  async deletePrefix(prefix: string, heartbeat = noop) {
    let totalCount = 0;
    let currentCount = 0;

    moduleLogger.info(
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
        moduleLogger.info(
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

    moduleLogger.info(
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

export const ingestS3 = new LcS3Client({
  bucket: env.S3_INGEST_BUCKET,
  region: env.S3_INGEST_REGION,
  endpoint: env.S3_INGEST_ENDPOINT,
  accessKeyId: env.S3_INGEST_ACCESS_KEY_ID,
  secretAccessKey: env.S3_INGEST_SECRET_ACCESS_KEY,
});

export const publicS3 = new LcS3Client({
  bucket: env.S3_PUBLIC_BUCKET,
  region: env.S3_PUBLIC_REGION,
  endpoint: env.S3_PUBLIC_ENDPOINT,
  accessKeyId: env.S3_PUBLIC_ACCESS_KEY_ID,
  secretAccessKey: env.S3_PUBLIC_SECRET_ACCESS_KEY,
});

export function getS3Client(clientId: S3ClientId): LcS3Client {
  return clientId === 'INGEST' ? ingestS3 : publicS3;
}

export async function getPublicUrlWithFilename(key: string, filename: string) {
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
