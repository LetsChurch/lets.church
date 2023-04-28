import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import envariant from '@knpwrs/envariant';
import pMap from 'p-map';
import pRetry from 'p-retry';
import invariant from 'tiny-invariant';
import { v4 as uuid } from 'uuid';
import PQueue from 'p-queue';

export const S3_INGEST_BUCKET = envariant('S3_INGEST_BUCKET');
const S3_INGEST_REGION = envariant('S3_INGEST_REGION');
const S3_INGEST_ENDPOINT = envariant('S3_INGEST_ENDPOINT');
const S3_INGEST_ACCESS_KEY_ID = envariant('S3_INGEST_ACCESS_KEY_ID');
const S3_INGEST_SECRET_ACCESS_KEY = envariant('S3_INGEST_SECRET_ACCESS_KEY');

export const S3_PUBLIC_BUCKET = envariant('S3_PUBLIC_BUCKET');
const S3_PUBLIC_REGION = envariant('S3_PUBLIC_REGION');
const S3_PUBLIC_ENDPOINT = envariant('S3_PUBLIC_ENDPOINT');
const S3_PUBLIC_ACCESS_KEY_ID = envariant('S3_PUBLIC_ACCESS_KEY_ID');
const S3_PUBLIC_SECRET_ACCESS_KEY = envariant('S3_PUBLIC_SECRET_ACCESS_KEY');

export const S3_BACKUP_BUCKET = envariant('S3_BACKUP_BUCKET');
const S3_BACKUP_REGION = envariant('S3_BACKUP_REGION');
const S3_BACKUP_ENDPOINT = envariant('S3_BACKUP_ENDPOINT');
const S3_BACKUP_ACCESS_KEY_ID = envariant('S3_BACKUP_ACCESS_KEY_ID');
const S3_BACKUP_SECRET_ACCESS_KEY = envariant('S3_BACKUP_SECRET_ACCESS_KEY');
const S3_BACKUP_STORAGE_CLASS = envariant('S3_BACKUP_STORAGE_CLASS');

export const s3IngestClient = new S3({
  region: S3_INGEST_REGION,
  endpoint: S3_INGEST_ENDPOINT,
  credentials: {
    accessKeyId: S3_INGEST_ACCESS_KEY_ID,
    secretAccessKey: S3_INGEST_SECRET_ACCESS_KEY,
  },
});

export const s3PublicClient = new S3({
  region: S3_PUBLIC_REGION,
  endpoint: S3_PUBLIC_ENDPOINT,
  credentials: {
    accessKeyId: S3_PUBLIC_ACCESS_KEY_ID,
    secretAccessKey: S3_PUBLIC_SECRET_ACCESS_KEY,
  },
});

export const s3BackupClient = new S3({
  region: S3_BACKUP_REGION,
  endpoint: S3_BACKUP_ENDPOINT,
  credentials: {
    accessKeyId: S3_BACKUP_ACCESS_KEY_ID,
    secretAccessKey: S3_BACKUP_SECRET_ACCESS_KEY,
  },
});

export const PART_SIZE = 10_000_000;

export async function createMultipartUpload(
  bucket: string,
  key: string,
  contentType: string,
) {
  const { UploadId: uploadId, Key: uploadKey } = await s3IngestClient.send(
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
  bucket: string,
  uploadId: string,
  uploadKey: string,
  part: number,
) {
  invariant(
    part > 0 && part <= 10_000,
    `Part number must be between 1 and 10,000 inclusive, was ${part}`,
  );

  return getSignedUrl(
    s3IngestClient,
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
  bucket: string,
  uploadId: string,
  uploadKey: string,
  size: number,
) {
  return pMap(
    Array(Math.ceil(size / PART_SIZE)).fill(null),
    (_, i) => createPresignedPartUploadUrl(bucket, uploadId, uploadKey, i + 1),
    { concurrency: 5 },
  );
}

export async function completeMultipartUpload(
  bucket: string,
  uploadId: string,
  uploadKey: string,
  eTags: Array<string>,
) {
  await s3IngestClient.send(
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
  bucket: string,
  uploadId: string,
  uploadKey: string,
) {
  await s3IngestClient.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: uploadKey,
      UploadId: uploadId,
    }),
  );
}

export async function createPresignedUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
) {
  return getSignedUrl(
    s3IngestClient,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 5 * 60 }, // 5 Minutes
  );
}

export async function createPresignedGetUrl(bucket: string, key: string) {
  return getSignedUrl(
    s3IngestClient,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: 60 * 60 }, // 1 hour
  );
}

export async function headObject(bucket: string, key: string) {
  try {
    return await s3IngestClient.headObject({
      Bucket: bucket,
      Key: key,
    });
  } catch (e) {
    console.log(e);
    return null;
  }
}

export async function getObject(bucket: string, key: string) {
  return s3IngestClient.getObject({
    Bucket: bucket,
    Key: key,
  });
}

export async function streamObjectToFile(
  bucket: string,
  key: string,
  path: string,
  heartbeat: () => unknown,
) {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const res = await s3IngestClient.send(cmd);

  if (res.Body instanceof Readable) {
    return pipeline(
      res.Body,
      function (chunk) {
        heartbeat();
        return chunk;
      },
      createWriteStream(path),
    );
  }

  throw new Error('Unknown response type');
}

export async function backupObjects(
  source: 'INGEST' | 'PUBLIC',
  prefix: string,
  heartbeat: () => unknown,
) {
  const client = source === 'PUBLIC' ? s3PublicClient : s3IngestClient;
  const bucket = source === 'PUBLIC' ? S3_PUBLIC_BUCKET : S3_INGEST_BUCKET;
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
        console.log(`Backing up ${entry.Key} from ${bucket}`);
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
        console.log('Done!');
      }) ?? [],
    );
  } while (continuationToken);

  await queue.onIdle();
}

export async function putFile(
  bucket: string,
  key: string,
  contentType: string,
  body: Readable | Buffer,
  {
    contentLength,
    client = s3IngestClient,
  }: {
    contentLength?: number;
    client?: S3Client;
  } = {},
) {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    Body: body,
    ...(contentLength ? { ContentLength: contentLength } : {}),
  });
  return client.send(cmd);
}

export async function retryablePutFile(
  bucket: string,
  key: string,
  contentType: string,
  body: Readable | Buffer,
  {
    maxAttempts = 5,
    ...otherOps
  }: {
    contentLength?: number;
    maxAttempts?: number;
    client?: S3Client;
  } = {},
) {
  return pRetry(() => putFile(bucket, key, contentType, body, otherOps), {
    retries: maxAttempts,
    onFailedAttempt: (error) => {
      console.log(`Error uploading ${key}`);
      console.log(error.message);
      console.log(
        `Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`,
      );
    },
  });
}

export async function deleteFile(bucket: string, key: string) {
  const cmd = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return s3IngestClient.send(cmd);
}
