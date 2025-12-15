import { z } from 'zod';
import { LcS3Client } from './index.js';

const env = z
  .object({
    S3_INGEST_BUCKET: z.string(),
    S3_INGEST_REGION: z.string(),
    S3_INGEST_ENDPOINT: z.string(),
    S3_INGEST_ACCESS_KEY_ID: z.string(),
    S3_INGEST_SECRET_ACCESS_KEY: z.string(),
  })
  .parse(process.env);

export const ingestS3 = new LcS3Client({
  bucket: env.S3_INGEST_BUCKET,
  region: env.S3_INGEST_REGION,
  endpoint: env.S3_INGEST_ENDPOINT,
  accessKeyId: env.S3_INGEST_ACCESS_KEY_ID,
  secretAccessKey: env.S3_INGEST_SECRET_ACCESS_KEY,
});

export const ingestConfig = {
  bucket: env.S3_INGEST_BUCKET,
  region: env.S3_INGEST_REGION,
  endpoint: env.S3_INGEST_ENDPOINT,
  accessKeyId: env.S3_INGEST_ACCESS_KEY_ID,
  secretAccessKey: env.S3_INGEST_SECRET_ACCESS_KEY,
};
