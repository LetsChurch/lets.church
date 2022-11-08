import { GetObjectCommand, PutObjectCommand, S3 } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import envariant from '@knpwrs/envariant';
import pRetry from 'p-retry';

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

export async function createPresignedGetUrl(key: string) {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }),
    { expiresIn: 60 * 60 },
  );
}
