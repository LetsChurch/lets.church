import {
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import * as z from 'zod';

const env = z
  .object({
    S3_INGEST_ENDPOINT: z.string(),
    S3_BUCKET: z.string(),
    S3_INGEST_REGION: z.string(),
    S3_INGEST_ACCESS_KEY_ID: z.string(),
    S3_INGEST_SECRET_ACCESS_KEY: z.string(),
  })
  .parse(process.env);

const client = new S3Client({
  region: env.S3_INGEST_REGION,
  endpoint: env.S3_INGEST_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_INGEST_ACCESS_KEY_ID,
    secretAccessKey: env.S3_INGEST_SECRET_ACCESS_KEY,
  },
});

const { Uploads: uploads = [] } = await client.send(
  new ListMultipartUploadsCommand({ Bucket: env.S3_BUCKET }),
);

console.log(`Found ${uploads.length} uploads`);

for (const { Key, UploadId } of uploads) {
  console.log(`Aborting upload ${Key} (${UploadId})`);
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: env.S3_BUCKET,
      Key,
      UploadId,
    }),
  );
  console.log('Done');
}

console.log('Done done');
