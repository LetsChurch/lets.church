import envariant from '@knpwrs/envariant';
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: envariant('S3_INGEST_REGION'),
  endpoint: envariant('S3_INGEST_ENDPOINT'),
  credentials: {
    accessKeyId: envariant('S3_INGEST_ACCESS_KEY_ID'),
    secretAccessKey: envariant('S3_INGEST_SECRET_ACCESS_KEY'),
  },
});

console.log(
  await client.send(
    new PutBucketCorsCommand({
      Bucket: envariant('S3_INGEST_BUCKET'),
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedMethods: ['PUT'],
            AllowedOrigins: ['*'],
            AllowedHeaders: ['Content-Type', 'Content-Length'],
            ExposeHeaders: ['ETag'],
          },
        ],
      },
    }),
  ),
);

console.log(
  await client.send(
    new PutBucketCorsCommand({
      Bucket: envariant('S3_PUBLIC_BUCKET'),

      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ['*'],
            AllowedMethods: ['GET'],
          },
        ],
      },
    }),
  ),
);
