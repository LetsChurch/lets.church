import { createReadStream, createWriteStream } from 'node:fs';
import { type Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { stat } from 'node:fs/promises';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import envariant from '@knpwrs/envariant';
import pMap from 'p-map';
import pRetry from 'p-retry';
import invariant from 'tiny-invariant';
import { v4 as uuid } from 'uuid';
import PQueue from 'p-queue';
import type { MergeExclusive } from 'type-fest';
import sanitizeFilename from 'sanitize-filename';
import { noop } from 'lodash-es';
import logger from './logger';

const moduleLogger = logger.child({ module: 'util/s3' });

const S3_INGEST_BUCKET = envariant('S3_INGEST_BUCKET');
const S3_INGEST_REGION = envariant('S3_INGEST_REGION');
const S3_INGEST_ENDPOINT = envariant('S3_INGEST_ENDPOINT');
const S3_INGEST_ACCESS_KEY_ID = envariant('S3_INGEST_ACCESS_KEY_ID');
const S3_INGEST_SECRET_ACCESS_KEY = envariant('S3_INGEST_SECRET_ACCESS_KEY');

const S3_PUBLIC_BUCKET = envariant('S3_PUBLIC_BUCKET');
const S3_PUBLIC_REGION = envariant('S3_PUBLIC_REGION');
const S3_PUBLIC_ENDPOINT = envariant('S3_PUBLIC_ENDPOINT');
const S3_PUBLIC_ACCESS_KEY_ID = envariant('S3_PUBLIC_ACCESS_KEY_ID');
const S3_PUBLIC_SECRET_ACCESS_KEY = envariant('S3_PUBLIC_SECRET_ACCESS_KEY');

const S3_BACKUP_BUCKET = envariant('S3_BACKUP_BUCKET');
const S3_BACKUP_REGION = envariant('S3_BACKUP_REGION');
const S3_BACKUP_ENDPOINT = envariant('S3_BACKUP_ENDPOINT');
const S3_BACKUP_ACCESS_KEY_ID = envariant('S3_BACKUP_ACCESS_KEY_ID');
const S3_BACKUP_SECRET_ACCESS_KEY = envariant('S3_BACKUP_SECRET_ACCESS_KEY');
const S3_BACKUP_STORAGE_CLASS = envariant('S3_BACKUP_STORAGE_CLASS');

const s3IngestClient = new S3({
  region: S3_INGEST_REGION,
  endpoint: S3_INGEST_ENDPOINT,
  credentials: {
    accessKeyId: S3_INGEST_ACCESS_KEY_ID,
    secretAccessKey: S3_INGEST_SECRET_ACCESS_KEY,
  },
});

const s3PublicClient = new S3({
  region: S3_PUBLIC_REGION,
  endpoint: S3_PUBLIC_ENDPOINT,
  credentials: {
    accessKeyId: S3_PUBLIC_ACCESS_KEY_ID,
    secretAccessKey: S3_PUBLIC_SECRET_ACCESS_KEY,
  },
});

const s3BackupClient = new S3({
  region: S3_BACKUP_REGION,
  endpoint: S3_BACKUP_ENDPOINT,
  credentials: {
    accessKeyId: S3_BACKUP_ACCESS_KEY_ID,
    secretAccessKey: S3_BACKUP_SECRET_ACCESS_KEY,
  },
});

export type Client = 'INGEST' | 'PUBLIC';

export function getS3ProtocolUri(from: Client, key: string) {
  return `s3://${
    from === 'PUBLIC' ? S3_PUBLIC_BUCKET : S3_INGEST_BUCKET
  }/${key}`;
}

function getClientAndBucket(client: Client) {
  return {
    client: client === 'INGEST' ? s3IngestClient : s3PublicClient,
    bucket: client === 'INGEST' ? S3_INGEST_BUCKET : S3_PUBLIC_BUCKET,
  };
}

export const PART_SIZE = 10_000_000;

export async function createMultipartUpload(
  to: Client,
  key: string,
  contentType: string,
) {
  const { client, bucket } = getClientAndBucket(to);
  const { UploadId: uploadId, Key: uploadKey } = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: `${key}/${uuid()}`,
      ContentType: contentType,
    }),
  );

  invariant(uploadId && uploadKey, 'Failed to create multipart upload id!');

  return { uploadId, uploadKey };
}

export function createPresignedPartUploadUrl(
  to: Client,
  uploadId: string,
  uploadKey: string,
  part: number,
) {
  invariant(
    part > 0 && part <= 10_000,
    `Part number must be between 1 and 10,000 inclusive, was ${part}`,
  );

  const { client, bucket } = getClientAndBucket(to);

  return getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: bucket,
      UploadId: uploadId,
      Key: uploadKey,
      PartNumber: part,
    }),
    { expiresIn: 60 * 60 * 12 }, // 12 hours
  );
}

export async function createPresignedPartUploadUrls(
  to: Client,
  uploadId: string,
  uploadKey: string,
  size: number,
) {
  return pMap(
    Array(Math.ceil(size / PART_SIZE)).fill(null),
    (_, i) => createPresignedPartUploadUrl(to, uploadId, uploadKey, i + 1),
    { concurrency: 5 },
  );
}

export async function completeMultipartUpload(
  to: Client,
  uploadId: string,
  uploadKey: string,
  eTags: Array<string>,
) {
  const { client, bucket } = getClientAndBucket(to);

  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: uploadKey,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: eTags.map((tag, i) => ({ ETag: tag, PartNumber: i + 1 })),
      },
    }),
  );
}

export async function abortMultipartUpload(
  to: Client,
  uploadId: string,
  uploadKey: string,
) {
  const { client, bucket } = getClientAndBucket(to);

  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: uploadKey,
      UploadId: uploadId,
    }),
  );
}

export async function createPresignedUploadUrl(
  to: Client,
  key: string,
  contentType: string,
) {
  const { client, bucket } = getClientAndBucket(to);

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 5 * 60 }, // 5 Minutes
  );
}

export async function getPublicUrlWithFilename(key: string, filename: string) {
  return getSignedUrl(
    s3PublicClient,
    new GetObjectCommand({
      Bucket: S3_PUBLIC_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${sanitizeFilename(
        filename,
      )}"`,
    }),
  );
}

export async function createPresignedGetUrl(
  to: Client,
  key: string,
  expiresIn = 60 ** 2, // one hour
) {
  const { client, bucket } = getClientAndBucket(to);

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn }, // 1 hour
  );
}

export async function headObject(to: Client, key: string) {
  const { client, bucket } = getClientAndBucket(to);

  try {
    return await client.headObject({
      Bucket: bucket,
      Key: key,
    });
  } catch (e) {
    moduleLogger.error(e);
    return null;
  }
}

export async function getObject(to: Client, key: string) {
  const { client, bucket } = getClientAndBucket(to);

  return client.getObject({
    Bucket: bucket,
    Key: key,
  });
}

export async function streamObjectToFile(
  from: Client,
  key: string,
  path: string,
  heartbeat?: (arg: string) => unknown,
) {
  const { client, bucket } = getClientAndBucket(from);
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const res = await client.send(cmd);

  invariant(res.Body, 'No body in response!');
  return pipeline(
    res.Body.transformToWebStream(),
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

export async function* listObjects(source: Client, prefix?: string) {
  const { client, bucket } = getClientAndBucket(source);

  let continuationToken: string | undefined = undefined;

  do {
    const listCmd: ListObjectsV2Command = new ListObjectsV2Command({
      Bucket: bucket,
      ...(prefix ? { Prefix: prefix } : {}),
      ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
    });

    const listRes = await client.send(listCmd);

    continuationToken = listRes.IsTruncated
      ? listRes.NextContinuationToken
      : undefined;

    for (const entry of listRes.Contents?.filter(Boolean) ?? []) {
      yield entry;
    }
  } while (continuationToken);
}

export async function* listKeys(source: Client, prefix?: string) {
  for await (const { Key } of listObjects(source, prefix)) {
    if (Key) {
      yield Key;
    }
  }
}

export async function* listPrefixes(source: Client) {
  const seen = new Set();

  for await (const key of listKeys(source)) {
    const prefix = key.split('/').at(0);

    if (prefix && !seen.has(prefix)) {
      yield prefix;
    }

    seen.add(prefix);
  }
}

export async function backupObjects(
  source: Client,
  prefix: string,
  heartbeat: () => unknown,
) {
  const { client, bucket } = getClientAndBucket(source);
  const queue = new PQueue({ concurrency: 5 });

  let continuationToken: string | undefined = undefined;

  do {
    const listCmd: ListObjectsV2Command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
    });
    const listRes = await client.send(listCmd);
    continuationToken = listRes.IsTruncated
      ? listRes.NextContinuationToken
      : undefined;

    queue.addAll(
      listRes.Contents?.map((entry) => async () => {
        moduleLogger.info(`Backing up ${entry.Key} from ${bucket}`);
        const cmd = new GetObjectCommand({ Bucket: bucket, Key: entry.Key });
        const {
          Body: body,
          ContentType: contentType,
          ContentLength: contentLength,
        } = await client.send(cmd);

        invariant(body, 'Failed to get object body');
        invariant(contentType, 'Failed to get object content type');
        invariant(contentLength, 'Failed to get object content length');

        await s3BackupClient.send(
          new PutObjectCommand({
            Bucket: S3_BACKUP_BUCKET,
            Key: `${bucket}/${entry.Key}`,
            Body: body,
            ContentType: contentType,
            ContentLength: contentLength,
            StorageClass: S3_BACKUP_STORAGE_CLASS,
          }),
        );
        heartbeat();
        moduleLogger.info('Done!');
      }) ?? [],
    );
  } while (continuationToken);

  await queue.onIdle();
}

export async function putFile({
  to = 'INGEST',
  key,
  contentType,
  body,
  path,
  contentLength,
}: {
  to?: Client;
  key: string;
  contentType: string;
  contentLength?: number;
} & MergeExclusive<{ body: Readable | Buffer }, { path: string }>) {
  invariant(body || path, 'Body or path must be provided to putFile');

  const { bucket, client } = getClientAndBucket(to);

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    Body: body ? body : createReadStream(path),
    ...(contentLength ? { ContentLength: contentLength } : {}),
  });
  return client.send(cmd);
}

export async function putFileMultipart({
  to = 'INGEST',
  key,
  contentType,
  path,
}: {
  to?: Client;
  key: string;
  contentType: string;
  path: string;
}) {
  const { bucket, client } = getClientAndBucket(to);

  const fileSize = (await stat(path)).size;
  const partSize = 3 * 1024 ** 3; // 3 GB per part
  const numParts = Math.ceil(fileSize / partSize);

  const createUpload = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
  );

  const uploadId = createUpload.UploadId;
  try {
    const completedParts = [];

    for (let i = 0; i < numParts; i++) {
      const start = i * partSize;
      const end = Math.min(start + partSize, fileSize) - 1;

      const { ETag } = await client.send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          PartNumber: i + 1,
          UploadId: uploadId,
          Body: createReadStream(path, { start, end }),
        }),
      );

      invariant(ETag, 'Failed to get Etag');

      completedParts.push({ PartNumber: i + 1, ETag });
    }

    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        MultipartUpload: {
          Parts: completedParts,
        },
        UploadId: uploadId,
      }),
    );
  } catch (e) {
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }
}

export async function retryablePutFile({
  maxAttempts = 5,
  signal,
  ...otherOps
}: {
  to?: Client;
  key: string;
  contentType: string;
  contentLength?: number;
  maxAttempts?: number;
  signal: AbortSignal;
} & MergeExclusive<{ body: Buffer }, { path: string }>) {
  return pRetry(() => putFile(otherOps), {
    signal,
    retries: maxAttempts,
    onFailedAttempt: (error) => {
      moduleLogger.warn(`Error uploading ${otherOps.key}`);
      moduleLogger.warn(error.message);
      moduleLogger.warn(
        `Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`,
      );
    },
  });
}

export async function deleteFile(target: Client, key: string) {
  const { client, bucket } = getClientAndBucket(target);

  const cmd = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return client.send(cmd);
}

export async function deletePrefix(
  to: Client,
  prefix: string,
  heartbeat = noop,
) {
  const { client, bucket } = getClientAndBucket(to);

  let totalCount = 0;
  let currentCount = 0;

  moduleLogger.info(`Deleting objects from ${bucket} with prefix ${prefix}`);

  do {
    const listCmd: ListObjectsV2Command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const listRes = await client.send(listCmd);

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
        `Deleting ${currentCount} objects from ${bucket} with prefix ${prefix}`,
      );

      const deleteCmd = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: objects,
        },
      });

      await client.send(deleteCmd);

      heartbeat();
    }
  } while (currentCount > 0);

  moduleLogger.info(
    `Done deleting ${totalCount} objects from ${bucket} with prefix ${prefix}`,
  );

  return totalCount;
}
