import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import envariant from '@knpwrs/envariant';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import pMap from 'p-map';
import pRetry from 'p-retry';
import invariant from 'tiny-invariant';

const S3_REGION = envariant('S3_REGION');
const S3_ENDPOINT = envariant('S3_ENDPOINT');
const S3_BUCKET = envariant('S3_BUCKET');
const S3_ACCESS_KEY_ID = envariant('S3_ACCESS_KEY_ID');
const S3_SECRET_ACCESS_KEY = envariant('S3_SECRET_ACCESS_KEY');

export const client = new S3({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
});

export const PART_SIZE = 10_000_000;

export async function createMultipartUpload(key: string, contentType: string) {
  const { UploadId: uploadId, Key: uploadKey } = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
  );

  invariant(uploadId && uploadKey, 'Failed to create multipart upload id!');

  return { uploadId, uploadKey };
}

export function createPresignedPartUploadUrl(
  uploadId: string,
  uploadKey: string,
  part: number,
) {
  invariant(
    part > 0 && part <= 10_000,
    `Part number must be between 1 and 10,000 inclusive, was ${part}`,
  );

  return getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: S3_BUCKET,
      UploadId: uploadId,
      Key: uploadKey,
      PartNumber: part,
    }),
    { expiresIn: 60 * 60 * 12 }, // 12 hours
  );
}

export async function createPresignedPartUploadUrls(
  uploadId: string,
  uploadKey: string,
  size: number,
) {
  return pMap(
    Array(Math.ceil(size / PART_SIZE)).fill(null),
    (_, i) => createPresignedPartUploadUrl(uploadId, uploadKey, i + 1),
    { concurrency: 5 },
  );
}

export async function completeMultipartUpload(
  uploadKey: string,
  uploadId: string,
  eTags: Array<string>,
) {
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: S3_BUCKET,
      Key: uploadKey,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: eTags.map((tag, i) => ({ ETag: tag, PartNumber: i + 1 })),
      },
    }),
  );
}

export async function abortMultipartUpload(
  uploadKey: string,
  uploadId: string,
) {
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: S3_BUCKET,
      Key: uploadKey,
      UploadId: uploadId,
    }),
  );
}

export async function createPresignedUploadUrl(
  key: string,
  contentType: string,
) {
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 5 * 60 }, // 5 Minutes
  );
}

export async function createPresignedGetUrl(key: string) {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }),
    { expiresIn: 60 * 60 }, // 1 hour
  );
}

export async function headObject(key: string) {
  try {
    return await client.headObject({
      Bucket: S3_BUCKET,
      Key: key,
    });
  } catch (e) {
    console.log(e);
    return null;
  }
}

export async function getObject(key: string) {
  return client.getObject({
    Bucket: S3_BUCKET,
    Key: key,
  });
}

export async function streamObjectToFile(key: string, path: string) {
  const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  const res = await client.send(cmd);

  if (res.Body instanceof Readable) {
    return pipeline(res.Body, createWriteStream(path));
  }

  throw new Error('Unknown resposne type');
}

export async function putFile(
  key: string,
  contentType: string,
  body: Readable | Buffer,
  {
    contentLength,
  }: {
    contentLength?: number;
  } = {},
) {
  const cmd = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
    Body: body,
    ...(contentLength ? { ContentLength: contentLength } : {}),
  });
  return client.send(cmd);
}

export async function retryablePutFile(
  key: string,
  contentType: string,
  body: Readable | Buffer,
  {
    contentLength,
    maxAttempts = 5,
  }: {
    contentLength?: number;
    maxAttempts?: number;
  } = {},
) {
  return pRetry(
    () =>
      putFile(key, contentType, body, contentLength ? { contentLength } : {}),
    {
      retries: maxAttempts,
      onFailedAttempt: (error) => {
        console.log(`Error uploading ${key}`);
        console.log(error.message);
        console.log(
          `Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`,
        );
      },
    },
  );
}
